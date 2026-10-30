import { taskOutbox } from "./settings";
import { evaluateRules, eligibleForRecompute } from "../shared/management";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { trips as tripTable } from "../../drizzle/schema";
import {
  applyCommand,
  type Command,
  type Enquiry,
  type State,
  type Trip,
} from "../shared/domain";
import type { Identity } from "../shared/api";
import { ApiError } from "./errors";
const json = JSON.stringify;
type Row = {
  id: string;
  customer_id: string;
  trip_id: string;
  owner_id: string;
  stage: string;
  revision: number;
  data: string;
  name: string;
  email: string | null;
  phone_e164: string | null;
  owner_name: string;
};
export class Repository {
  constructor(
    readonly db: D1Database,
    readonly actor: Identity,
  ) {}
  private scope = () =>
    this.actor.role === "manager"
      ? { sql: "1=1", values: [] }
      : {
          sql: "(e.owner_id=? OR json_extract(e.data,'$.shared')=1)",
          values: [this.actor.id],
        };
  async state(id?: string): Promise<State> {
    const scope = this.scope();
    const condition = `${scope.sql} AND json_extract(e.data,'$.deletedAt') IS NULL${id ? " AND e.id=?" : ""}`;
    const values = [...scope.values, ...(id ? [id] : [])];
    const select = `SELECT e.*, c.name,c.email,c.phone_e164,u.display_name AS owner_name FROM enquiries e JOIN customers c ON c.id=e.customer_id JOIN users u ON u.id=e.owner_id WHERE ${condition} ORDER BY e.created_at DESC`;
    const children = [
      "tasks",
      "activities",
      "payments",
      "quotations",
      "bookings",
    ];
    const result = await this.db.batch<Record<string, unknown>>([
      this.db.prepare(select).bind(...values),
      ...children.map((table) =>
        this.db
          .prepare(
            `SELECT * FROM ${table} WHERE enquiry_id IN (SELECT e.id FROM enquiries e WHERE ${condition}) ORDER BY rowid DESC`,
          )
          .bind(...values),
      ),
    ]);
    const child = (index: number, enquiryId: string) =>
      result[index].results
        .filter((r) => r.enquiry_id === enquiryId)
        .map((r) => JSON.parse(String(r.data)));
    const enquiries = result[0].results.map((raw) => {
      const row = raw as unknown as Row;
      const data = JSON.parse(row.data) as Enquiry;
      return {
        ...data,
        id: row.id,
        customerId: row.customer_id,
        tripId: row.trip_id,
        ownerId: row.owner_id,
        owner: data.shared ? "Shared team" : row.owner_name,
        name: row.name,
        email: row.email || "",
        phone: row.phone_e164,
        stage: row.stage,
        revision: row.revision,
        tasks: child(1, row.id),
        activities: child(2, row.id).sort((a, b) => b.at.localeCompare(a.at)),
        payments: child(3, row.id),
        quote: child(4, row.id)[0],
        booking: child(5, row.id)[0],
      } as Enquiry;
    });
    const trips = await drizzle(this.db).select().from(tripTable);
    return {
      version: 1,
      enquiries,
      trips: trips
        .filter((t) => !(t.data as Trip & { deletedAt?: string }).deletedAt)
        .map((t) => {
          const { writeToken, ...data } = t.data as Trip & {
            writeToken?: string;
          };
          return {
            ...data,
            id: t.id,
            version: t.version,
            name: t.name,
          };
        }),
    };
  }
  async enquiry(id: string) {
    const e = (await this.state(id)).enquiries[0];
    if (!e)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "Enquiry not found or not assigned to you.",
      );
    return e;
  }
  async customers(search: string) {
    const scope = this.scope();
    const rows = await this.db
      .prepare(
        `SELECT c.id,c.name,COALESCE(c.email,'') AS email,c.phone_e164 AS phone FROM customers c WHERE EXISTS(SELECT 1 FROM enquiries e WHERE e.customer_id=c.id AND ${scope.sql}) AND instr(lower(c.name||' '||COALESCE(c.email,'')||' '||COALESCE(c.phone_e164,'')),lower(?))>0 ORDER BY c.name,c.id LIMIT 20`,
      )
      .bind(...scope.values, search.trim())
      .all();
    return rows.results;
  }
  async receipt(key: string, resource: string, fingerprint: string) {
    const row = await this.db
      .prepare(
        "SELECT actor_id,resource,fingerprint,response FROM idempotency_keys WHERE key=?",
      )
      .bind(key)
      .first<{
        actor_id: string;
        resource: string;
        fingerprint: string;
        response: string;
      }>();
    if (!row) return null;
    if (
      row.actor_id !== this.actor.id ||
      row.resource !== resource ||
      row.fingerprint !== fingerprint
    )
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This request key was already used for a different action.",
      );
    return JSON.parse(row.response) as Record<string, unknown>;
  }
  async command(
    id: string,
    revision: number,
    command: Command,
    key: string,
    fingerprint: string,
    requestId: string,
  ) {
    const before = await this.enquiry(id);
    const replay = await this.receipt(key, id, fingerprint);
    if (replay) return replay;
    if (command.type === "reverse" && this.actor.role !== "manager")
      throw new ApiError(
        403,
        "MANAGER_REQUIRED",
        "Only a manager can reverse recorded payments.",
      );
    if (command.type === "confirm" && before.booking)
      return { reference: before.booking.reference, revision: before.revision };
    if (before.revision !== revision)
      throw new ApiError(
        409,
        "REVISION_CONFLICT",
        "This enquiry changed. Reload the record before editing.",
      );
    const trip = await drizzle(this.db)
      .select()
      .from(tripTable)
      .where(eq(tripTable.id, before.tripId));
    let after: Enquiry;
    try {
      after = applyCommand(
        before,
        command,
        (trip[0]?.data as Trip)?.groupVisaPolicy,
        { actor: this.actor.name, demo: this.actor.local },
      );
    } catch (e) {
      throw new ApiError(
        400,
        "BUSINESS_RULE",
        e instanceof Error ? e.message : "Invalid action.",
      );
    }
    const activeTrip = trip[0]?.data as Trip;
    if (command.type === "qualify" && !before.override) {
      if (!eligibleForRecompute(before)) {
        after.rank = before.rank;
        after.rankReason = before.rankReason;
        after.rankRuleVersion = before.rankRuleVersion;
        after.rankComputedAt = before.rankComputedAt;
      } else if (activeTrip.activeRules) {
        const fit = evaluateRules(
          activeTrip.activeRules,
          after.group,
          after.visa,
        );
        after.rank = fit.rank;
        after.rankReason = fit.reason;
        after.rankRuleVersion = activeTrip.activeRuleVersion;
        after.rankComputedAt = new Date().toISOString();
      } else if (!this.actor.local) {
        after.rank = null;
        after.rankReason =
          "Needs qualification: no reviewed rule version is active.";
      }
    }
    const token = crypto.randomUUID();
    const now = new Date().toISOString();
    const contactChanged =
      before.name !== after.name ||
      before.email !== after.email ||
      before.phone !== after.phone;
    if (
      contactChanged &&
      after.phone &&
      (await this.db
        .prepare(
          "SELECT id FROM customers WHERE phone_e164=? AND id<>? LIMIT 1",
        )
        .bind(after.phone, before.customerId)
        .first())
    )
      throw new ApiError(
        409,
        "CONTACT_CONFLICT",
        "That phone is already on another customer. Review the records before changing it.",
      );
    const base = {
      ...after,
      tasks: undefined,
      activities: undefined,
      payments: undefined,
      quote: undefined,
      booking: undefined,
    };
    const guard =
      "EXISTS(SELECT 1 FROM enquiries WHERE id=? AND write_token=?)";
    const guarded = (sql: string, values: unknown[]) =>
      this.db.prepare(sql).bind(...values, id, token);
    const writes: D1PreparedStatement[] = [
      this.db
        .prepare(
          "UPDATE enquiries SET data=?,stage=?,revision=?,write_token=?,updated_at=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM customers WHERE id=? AND name=? AND COALESCE(email,'')=? AND phone_e164 IS ?)",
        )
        .bind(
          json(base),
          after.stage,
          after.revision,
          token,
          now,
          id,
          revision,
          before.customerId,
          before.name,
          before.email,
          before.phone,
        ),
    ];
    if (contactChanged)
      writes.push(
        guarded(
          `UPDATE customers SET name=?,email=?,phone_e164=?,contact_validity=CASE WHEN phone_e164 IS ? THEN contact_validity ELSE ? END WHERE id=? AND ${guard}`,
          [
            after.name,
            after.email || null,
            after.phone,
            after.phone,
            after.phone ? "submitted" : "unknown",
            before.customerId,
          ],
        ),
      );
    for (const task of after.tasks) {
      const old = before.tasks.find((t) => t.id === task.id);
      if (!old)
        writes.push(
          guarded(
            `INSERT INTO tasks(id,enquiry_id,owner_id,due_at,status,data) SELECT ?,?,?,?,?,? WHERE ${guard}`,
            [task.id, id, before.ownerId, task.due, task.status, json(task)],
          ),
        );
      else if (json(old) !== json(task))
        writes.push(
          guarded(
            `UPDATE tasks SET status=?,data=? WHERE id=? AND enquiry_id=? AND ${guard}`,
            [task.status, json(task), task.id, id],
          ),
        );
    }
    for (const activity of after.activities.filter(
      (a) => !before.activities.some((b) => b.id === a.id),
    ))
      writes.push(
        guarded(
          `INSERT INTO activities(id,enquiry_id,actor_id,occurred_at,data) SELECT ?,?,?,?,? WHERE ${guard}`,
          [activity.id, id, this.actor.id, activity.at, json(activity)],
        ),
      );
    for (const payment of after.payments) {
      const old = before.payments.find((p) => p.id === payment.id);
      if (!old)
        writes.push(
          guarded(
            `INSERT INTO payments(id,enquiry_id,amount,currency,status,received_at,data) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
            [
              payment.id,
              id,
              payment.amount,
              payment.currency,
              payment.status,
              payment.date,
              json(payment),
            ],
          ),
        );
      else if (json(old) !== json(payment))
        writes.push(
          guarded(
            `UPDATE payments SET status=?,data=? WHERE id=? AND enquiry_id=? AND ${guard}`,
            [payment.status, json(payment), payment.id, id],
          ),
        );
    }
    if (after.quote && !before.quote)
      writes.push(
        guarded(
          `INSERT INTO quotations(id,enquiry_id,amount,required_deposit,currency,data) SELECT ?,?,?,?,?,? WHERE ${guard}`,
          [
            after.quote.id,
            id,
            after.quote.total,
            after.quote.deposit,
            after.quote.currency,
            json(after.quote),
          ],
        ),
      );
    if (after.booking && !before.booking)
      writes.push(
        guarded(
          `INSERT INTO bookings(id,enquiry_id,reference,quotation_id,amount,required_deposit,currency,confirmed_at,confirmed_by,data) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,
          [
            crypto.randomUUID(),
            id,
            after.booking.reference,
            after.quote!.id,
            after.quote!.total,
            after.quote!.deposit,
            after.quote!.currency,
            after.booking.confirmedAt,
            this.actor.id,
            json(after.booking),
          ],
        ),
      );
    writes.push(taskOutbox(this.db, id, { id, token }));
    writes.push(
      guarded(
        "UPDATE scheduled_actions SET status='cancelled',lease_until=NULL,updated_at=? WHERE enquiry_id=? AND status IN ('pending','queued','processing','held') AND (task_id IN (SELECT id FROM tasks WHERE status<>'pending') OR EXISTS(SELECT 1 FROM enquiries WHERE id=? AND stage IN ('CONFIRMED','LOST','NOT_SUITABLE','ON_HOLD'))) AND " +
          guard,
        [now, id, id],
      ),
    );
    const response = {
      revision: after.revision,
      ...(after.booking ? { reference: after.booking.reference } : {}),
    };
    writes.push(
      guarded(
        `INSERT INTO idempotency_keys(key,actor_id,resource,fingerprint,response,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
        [key, this.actor.id, id, fingerprint, json(response), now],
      ),
    );
    writes.push(
      guarded(
        `INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
        [
          crypto.randomUUID(),
          this.actor.id,
          id,
          command.type,
          requestId,
          now,
          json({
            fromRevision: revision,
            toRevision: after.revision,
            ...(contactChanged
              ? { customerId: before.customerId, contactChanged: true }
              : {}),
          }),
        ],
      ),
    );
    try {
      const results = await this.db.batch(writes);
      if (results[0].meta.changes !== 1) {
        const replay = await this.receipt(key, id, fingerprint);
        if (replay) return replay;
        throw new ApiError(
          409,
          "REVISION_CONFLICT",
          "Another staff action changed this enquiry. Refresh and try again.",
        );
      }
    } catch (e) {
      const replay = await this.receipt(key, id, fingerprint);
      if (replay) return replay;
      throw e;
    }
    return response;
  }
  async create(
    input: {
      name: string;
      tripId: string;
      customerId?: string;
      group?: Enquiry["group"];
      visa?: "all" | "none" | "unknown";
      travellers?: number | null;
      email?: string;
      phone?: string;
    },
    key: string,
    fingerprint: string,
    requestId: string,
  ) {
    const replay = await this.receipt(key, "create", fingerprint);
    if (replay) return replay;
    const trip = await this.db
      .prepare(
        "SELECT id,data FROM trips WHERE id=? AND json_extract(data,'$.deletedAt') IS NULL",
      )
      .bind(input.tripId)
      .first<{ id: string; data: string }>();
    if (!trip)
      throw new ApiError(400, "INVALID_TRIP", "Choose an existing trip.");
    let customer: {
      id: string;
      name: string;
      email: string | null;
      phone_e164: string | null;
    } | null = null;
    if (input.customerId) {
      customer = await this.db
        .prepare(
          `SELECT c.* FROM customers c WHERE c.id=? AND EXISTS(SELECT 1 FROM enquiries e WHERE e.customer_id=c.id AND ${this.scope().sql})`,
        )
        .bind(input.customerId, ...this.scope().values)
        .first();
      if (!customer)
        throw new ApiError(
          404,
          "NOT_FOUND",
          "Customer not found in your assigned records.",
        );
    }
    if (
      !customer &&
      input.phone &&
      (await this.db
        .prepare("SELECT id FROM customers WHERE phone_e164=? LIMIT 1")
        .bind(input.phone)
        .first())
    )
      throw new ApiError(
        409,
        "CONTACT_CONFLICT",
        "This phone is already on a customer. Search for the existing customer instead.",
      );
    const owner =
      this.actor.role === "staff"
        ? this.actor.id
        : (
            await this.db
              .prepare(
                `SELECT id FROM users WHERE active=1 AND role='staff' ORDER BY ${this.actor.local ? "CASE WHEN id='DEMO-STAFF' THEN 0 ELSE 1 END," : ""}created_at,id LIMIT 1`,
              )
              .first<{ id: string }>()
          )?.id || this.actor.id;
    if (!owner)
      throw new ApiError(
        400,
        "NO_OWNER",
        "Invite an active staff member before creating enquiries.",
      );
    const id = crypto.randomUUID();
    const customerId = customer?.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const name = customer?.name || input.name;
    const e: Enquiry = {
      id,
      customerId,
      name,
      email: customer ? customer.email || "" : input.email || "",
      phone: customer ? customer.phone_e164 : input.phone || null,
      tripId: input.tripId,
      ownerId: owner,
      shared: true,
      stage: "NEW",
      temperature: "unassessed",
      group: input.group || "unknown",
      visa: input.visa || "unknown",
      travellers: input.travellers ?? null,
      rank: null,
      rankReason: "Needs qualification: collect group and visa details.",
      response: "none",
      owner: "",
      source: "Manual",
      createdAt: now,
      originalNote: "Manually created enquiry.",
      originalGroup: "unknown",
      availability: "pending",
      tasks: [],
      activities: [],
      payments: [],
      revision: 0,
    };
    const statements: D1PreparedStatement[] = [];
    const tripData = JSON.parse(trip.data) as Trip;
    if (tripData.activeRules) {
      const fit = evaluateRules(tripData.activeRules, e.group, e.visa);
      e.rank = fit.rank;
      e.rankReason = fit.reason;
      e.rankRuleVersion = tripData.activeRuleVersion;
      e.rankComputedAt = now;
    }
    if (!customer)
      statements.push(
        this.db
          .prepare(
            "INSERT INTO customers(id,name,email,phone_e164,contact_validity,created_at) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            customerId,
            name,
            e.email || null,
            e.phone,
            e.phone ? "submitted" : "unknown",
            now,
          ),
      );
    statements.push(
      this.db
        .prepare(
          "INSERT INTO enquiries(id,customer_id,trip_id,owner_id,stage,revision,created_at,updated_at,data) VALUES(?,?,?,?,?,0,?,?,?)",
        )
        .bind(id, customerId, input.tripId, owner, "NEW", now, now, json(e)),
    );
    statements.push(
      this.db
        .prepare(
          "INSERT INTO enquiry_sources(id,enquiry_id,provider,original_note) VALUES(?,?,?,?)",
        )
        .bind(crypto.randomUUID(), id, "Manual", e.originalNote),
    );
    const activity = {
      id: crypto.randomUUID(),
      type: "source",
      text: "Enquiry created manually.",
      at: now,
      actor: this.actor.name,
    };
    statements.push(
      this.db
        .prepare(
          "INSERT INTO activities(id,enquiry_id,actor_id,occurred_at,data) VALUES(?,?,?,?,?)",
        )
        .bind(activity.id, id, this.actor.id, now, json(activity)),
    );
    const response = { id };
    statements.push(
      this.db
        .prepare(
          "INSERT INTO idempotency_keys(key,actor_id,resource,fingerprint,response,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(key, this.actor.id, "create", fingerprint, json(response), now),
    );
    statements.push(
      this.db
        .prepare(
          "INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          this.actor.id,
          id,
          "create",
          requestId,
          now,
          "{}",
        ),
    );
    try {
      await this.db.batch(statements);
    } catch (e) {
      const replay = await this.receipt(key, "create", fingerprint);
      if (replay) return replay;
      throw e;
    }
    return response;
  }
  async remove(
    kind: "enquiry" | "trip",
    id: string,
    revision: number,
    key: string,
    requestId: string,
  ) {
    if (this.actor.role !== "manager")
      throw new ApiError(
        403,
        "MANAGER_REQUIRED",
        "Only a manager can delete records.",
      );
    const resource = `delete:${kind}:${id}`;
    const fingerprint = String(revision);
    const replay = await this.receipt(key, resource, fingerprint);
    if (replay) return replay;
    const now = new Date().toISOString(),
      token = crypto.randomUUID();
    const table = kind === "enquiry" ? "enquiries" : "trips";
    const current = await this.db
      .prepare(
        `SELECT data,${kind === "enquiry" ? "revision" : "version"} AS revision FROM ${table} WHERE id=? AND json_extract(data,'$.deletedAt') IS NULL`,
      )
      .bind(id)
      .first<{ data: string; revision: number }>();
    if (!current) throw new ApiError(404, "NOT_FOUND", "Record not found.");
    if (current.revision !== revision)
      throw new ApiError(
        409,
        "REVISION_CONFLICT",
        "This record changed. Refresh before deleting.",
      );
    const protection =
      kind === "enquiry"
        ? "(json_extract(enquiries.data,'$.sample')=1 OR (NOT EXISTS(SELECT 1 FROM payments WHERE enquiry_id=enquiries.id) AND NOT EXISTS(SELECT 1 FROM bookings WHERE enquiry_id=enquiries.id)))"
        : "NOT EXISTS(SELECT 1 FROM enquiries WHERE trip_id=trips.id AND json_extract(data,'$.deletedAt') IS NULL)";
    const data = {
      ...JSON.parse(current.data),
      deletedAt: now,
      deletedBy: this.actor.id,
    };
    if (kind === "enquiry") {
      data.previousStage = data.stage;
      data.stage = "ON_HOLD";
      data.revision = revision + 1;
    } else {
      data.status = "inactive";
      data.version = revision + 1;
      data.writeToken = token;
    }
    const guard =
      kind === "enquiry"
        ? "EXISTS(SELECT 1 FROM enquiries WHERE id=? AND write_token=?)"
        : "EXISTS(SELECT 1 FROM trips WHERE id=? AND json_extract(data,'$.writeToken')=?)";
    const writes = [
      this.db
        .prepare(
          kind === "enquiry"
            ? `UPDATE enquiries SET data=?,revision=revision+1,stage='ON_HOLD',write_token=?,updated_at=? WHERE id=? AND revision=? AND json_extract(data,'$.deletedAt') IS NULL AND ${protection}`
            : `UPDATE trips SET data=?,version=version+1 WHERE id=? AND version=? AND json_extract(data,'$.deletedAt') IS NULL AND ${protection}`,
        )
        .bind(
          ...(kind === "enquiry"
            ? [json(data), token, now, id, revision]
            : [json(data), id, revision]),
        ),
    ];
    if (kind === "enquiry") {
      writes.push(
        this.db
          .prepare(
            `UPDATE tasks SET status='cancelled',data=json_set(data,'$.status','cancelled') WHERE enquiry_id=? AND status='pending' AND ${guard}`,
          )
          .bind(id, id, token),
      );
      writes.push(
        this.db
          .prepare(
            `UPDATE scheduled_actions SET status='cancelled',token=NULL,lease_until=NULL,updated_at=? WHERE enquiry_id=? AND status IN ('pending','queued','processing','held','failed') AND ${guard}`,
          )
          .bind(now, id, id, token),
      );
    }
    writes.push(
      this.db
        .prepare(
          `INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          crypto.randomUUID(),
          this.actor.id,
          id,
          `${kind}.delete`,
          requestId,
          now,
          json({ revision, retained: true }),
          id,
          token,
        ),
    );
    writes.push(
      this.db
        .prepare(
          `INSERT INTO idempotency_keys(key,actor_id,resource,fingerprint,response,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          key,
          this.actor.id,
          resource,
          fingerprint,
          '{"ok":true}',
          now,
          id,
          token,
        ),
    );
    try {
      const result = await this.db.batch(writes);
      if (result[0].meta.changes !== 1)
        throw new ApiError(
          409,
          "DELETE_BLOCKED",
          kind === "enquiry"
            ? "Enquiries with payments or bookings cannot be deleted. Otherwise refresh and try again."
            : "This trip has enquiries and cannot be deleted while they are linked. Refresh if the trip changed.",
        );
    } catch (error) {
      const replay = await this.receipt(key, resource, fingerprint);
      if (replay) return replay;
      throw error;
    }
    return { ok: true };
  }
  async saveTrip(
    trip: Trip,
    key: string,
    fingerprint: string,
    requestId: string,
  ) {
    const replay = await this.receipt(key, trip.id, fingerprint);
    if (replay) return replay;
    const current = await this.db
      .prepare("SELECT version,data FROM trips WHERE id=?")
      .bind(trip.id)
      .first<{ version: number; data: string }>();
    if (!current || JSON.parse(current.data).deletedAt)
      throw new ApiError(404, "NOT_FOUND", "Trip not found.");
    if (current.version !== trip.version)
      throw new ApiError(
        409,
        "REVISION_CONFLICT",
        "Trip changed. Refresh before saving.",
      );
    if (trip.groupVisaPolicy !== JSON.parse(current.data).groupVisaPolicy)
      throw new ApiError(
        400,
        "POLICY_REVIEW_REQUIRED",
        "Use the reviewed rule publication workflow before changing ranking policy.",
      );
    const previous = JSON.parse(current.data) as Trip;
    if (
      JSON.stringify(trip.activeRules) !==
        JSON.stringify(previous.activeRules) ||
      trip.activeRuleVersion !== previous.activeRuleVersion ||
      trip.activeContentVersion !== previous.activeContentVersion ||
      trip.publishedAt !== previous.publishedAt
    )
      throw new ApiError(
        400,
        "READ_ONLY_METADATA",
        "Use reviewed publication actions for active trip versions.",
      );
    const next = { ...trip, status: "draft", version: trip.version + 1 };
    const token = crypto.randomUUID();
    const stored = { ...next, writeToken: token };
    const response = { version: next.version };
    const now = new Date().toISOString();
    const guard =
      "EXISTS(SELECT 1 FROM trips WHERE id=? AND json_extract(data,'$.writeToken')=?)";
    try {
      const results = await this.db.batch([
        this.db
          .prepare(
            "UPDATE trips SET name=?,version=?,data=? WHERE id=? AND version=?",
          )
          .bind(trip.name, next.version, json(stored), trip.id, trip.version),
        this.db
          .prepare(
            `INSERT INTO idempotency_keys(key,actor_id,resource,fingerprint,response,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
          )
          .bind(
            key,
            this.actor.id,
            trip.id,
            fingerprint,
            json(response),
            now,
            trip.id,
            token,
          ),
        this.db
          .prepare(
            `INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
          )
          .bind(
            crypto.randomUUID(),
            this.actor.id,
            trip.id,
            "trip.edit",
            requestId,
            now,
            json({ version: next.version }),
            trip.id,
            token,
          ),
      ]);
      if (results[0].meta.changes !== 1)
        throw new ApiError(
          409,
          "REVISION_CONFLICT",
          "Trip changed. Refresh before saving.",
        );
    } catch (e) {
      const replay = await this.receipt(key, trip.id, fingerprint);
      if (replay) return replay;
      throw e;
    }
    return response;
  }
}
