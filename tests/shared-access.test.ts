import { beforeEach, afterEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { Repository } from "../src/server/repository";
import { seed } from "../src/shared/seed";
import { Hono } from "hono";
import { managementRoutes } from "../src/server/management";
import type { AppEnv } from "../src/server/types";
import { createTripSchema } from "../src/shared/api";
import { defaultRules } from "../src/shared/management";
import { callingList, leadColour } from "../src/shared/calling";

let sqlite: DatabaseSync, db: D1Database;
class Statement {
  constructor(
    readonly query: string,
    readonly values: any[] = [],
  ) {}
  bind(...values: any[]) {
    return new Statement(this.query, values);
  }
  async all() {
    return {
      success: true,
      results: sqlite.prepare(this.query).all(...this.values),
      meta: {
        changes: Number(sqlite.prepare("SELECT changes() AS n").get()!.n),
      },
    };
  }
  async first(column?: string) {
    const row = sqlite.prepare(this.query).get(...this.values);
    return column ? (row?.[column] ?? null) : (row ?? null);
  }
  async raw() {
    return (await this.all()).results.map((row) => Object.values(row));
  }
  async run() {
    return this.all();
  }
}
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync("drizzle/migrations/" + file, "utf8"));
  for (const id of ["STAFF-A", "STAFF-B"])
    sqlite
      .prepare(
        "INSERT INTO users(id,email,role,active,display_name) VALUES(?,?,'staff',1,?)",
      )
      .run(id, id.toLowerCase() + "@example.invalid", id);
  const trip = seed().trips[0];
  sqlite
    .prepare("INSERT INTO trips(id,name,version,data) VALUES(?,?,?,?)")
    .run(trip.id, trip.name, trip.version, JSON.stringify(trip));
  for (const shared of [true, false]) {
    const id = shared ? "SHARED" : "PRIVATE",
      e = {
        ...seed().enquiries[0],
        id,
        customerId: id,
        ownerId: "STAFF-B",
        shared,
        tripId: trip.id,
        revision: 0,
        stage: "NEW",
        tasks: [],
        activities: [],
        payments: [],
        quote: undefined,
        booking: undefined,
      };
    sqlite
      .prepare(
        "INSERT INTO customers(id,name,contact_validity,created_at) VALUES(?,?,'unknown',?)",
      )
      .run(id, "Fictional " + id, new Date().toISOString());
    sqlite
      .prepare(
        "INSERT INTO enquiries(id,customer_id,trip_id,owner_id,stage,revision,created_at,updated_at,data) VALUES(?,?,?,'STAFF-B','NEW',0,?,?,?)",
      )
      .run(id, id, trip.id, e.createdAt, e.createdAt, JSON.stringify(e));
  }
  db = {
    prepare: (query: string) => new Statement(query),
    batch: async (statements: Statement[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const stmt of statements) results.push(await stmt.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
});
afterEach(() => sqlite.close());
it("persists a shared initial call, replaces the note and schedules follow-up atomically with replay/conflict protection", async () => {
  const repo = new Repository(db, staff);
  const e = await repo.enquiry("SHARED");
  const command = {
    type: "saveCall" as const,
    colour: "orange" as const,
    note: "Interested; discuss dates.",
    followup: "2026-11-05T10:00:00Z",
  };
  await repo.command(
    e.id,
    e.revision,
    command,
    "calling-request-1",
    "call-fingerprint",
    "request-1",
  );
  const after = await repo.enquiry(e.id);
  expect(after.currentNote).toBe(command.note);
  expect(callingList(after)).toBe("followups");
  expect(after.activities.filter((a) => a.type === "call")).toHaveLength(1);
  expect(after.tasks.at(-1)?.due).toBe("2026-11-05T10:00:00.000Z");
  await repo.command(
    e.id,
    e.revision,
    command,
    "calling-request-1",
    "call-fingerprint",
    "request-2",
  );
  expect((await repo.enquiry(e.id)).activities).toEqual(after.activities);
  await expect(
    repo.command(
      e.id,
      e.revision,
      command,
      "calling-request-2",
      "other-fingerprint",
      "request-3",
    ),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  await repo.command(
    e.id,
    after.revision,
    { type: "saveCall", colour: "red", note: "Asked us not to call again." },
    "calling-request-3",
    "red-fingerprint",
    "request-4",
  );
  const closed = await repo.enquiry(e.id);
  expect(leadColour(closed)).toBe("red");
  expect(closed.tasks.every((t) => t.status !== "pending")).toBe(true);
  expect(closed.activities.some((a) => a.text === command.note)).toBe(true);
});
it("creates qualified enquiries using only their selected trip's active rules", async () => {
  const trip = seed().trips[0];
  sqlite
    .prepare("UPDATE trips SET data=? WHERE id=?")
    .run(
      JSON.stringify({
        ...trip,
        activeRules: defaultRules,
        activeRuleVersion: 2,
      }),
      trip.id,
    );
  const repo = new Repository(db, staff);
  const created = await repo.create(
    {
      name: "Sample friends",
      tripId: trip.id,
      group: "friends",
      visa: "all",
      travellers: 4,
    },
    "qualified-create-key",
    "qualified-fingerprint",
    "request-1",
  );
  expect(await repo.enquiry(String(created.id))).toMatchObject({
    rank: "P4",
    rankRuleVersion: 2,
    group: "friends",
    travellers: 4,
  });
});
it("publishes trip priorities after archived enquiries are excluded from the preview snapshot", async () => {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("identity", { ...staff, role: "manager" });
    c.set("requestId", "rule-request");
    await next();
  });
  app.route("/", managementRoutes);
  sqlite
    .prepare(
      "UPDATE enquiries SET data=json_set(data,'$.deletedAt','2026-10-30T00:00:00Z') WHERE id='PRIVATE'",
    )
    .run();
  const tripId = seed().trips[0].id;
  const preview = await app.request(
    `https://example.invalid/management/trips/${tripId}/rules/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: defaultRules }),
    },
    { DB: db } as any,
  );
  expect(preview.status).toBe(200);
  const body = (await preview.json()) as { id: string; rows: unknown[] };
  expect(body.rows).toHaveLength(1);
  const publish = await app.request(
    `https://example.invalid/management/trips/${tripId}/rules/publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "publish-calling-rules-key",
      },
      body: JSON.stringify({ previewId: body.id, reviewed: true }),
    },
    { DB: db } as any,
  );
  expect(publish.status).toBe(200);
  expect(
    (await new Repository(db, staff).state()).trips[0].activeRules,
  ).toEqual(defaultRules);
});
it("allows managers to remove review samples with synthetic deposits while protecting real financial records", async () => {
  sqlite
    .prepare(
      "UPDATE enquiries SET data=json_set(data,'$.sample',json('true')) WHERE id='SHARED'",
    )
    .run();
  const repo = new Repository(db, { ...staff, role: "manager" });
  let e = await repo.enquiry("SHARED");
  await repo.command(
    e.id,
    e.revision,
    { type: "quote", total: 100000, deposit: 20000, terms: "Sample terms" },
    "sample-quote-key",
    "samplequote",
    "req-1",
  );
  e = await repo.enquiry(e.id);
  await repo.command(
    e.id,
    e.revision,
    {
      type: "payment",
      amount: 20000,
      date: new Date().toISOString(),
      reference: "SAMPLE",
    },
    "sample-payment-key",
    "samplepayment",
    "req-2",
  );
  e = await repo.enquiry(e.id);
  expect(leadColour(e)).toBe("green");
  await repo.remove("enquiry", e.id, e.revision, "sample-delete-key", "req-3");
  expect((await repo.state()).enquiries).toHaveLength(1);
  expect(
    sqlite
      .prepare("SELECT count(*) n FROM payments WHERE enquiry_id='SHARED'")
      .get()!.n,
  ).toBe(1);
});
it("creates a full trip draft atomically, preserves fields and replays the same creation", async () => {
  const app = new Hono<AppEnv>();
  app.onError((error, c) =>
    c.json(
      { message: error.message },
      (error as { status?: 403 }).status || 500,
    ),
  );
  app.use("*", async (c, next) => {
    c.set("identity", { ...staff, role: "manager" });
    c.set("requestId", "trip-create-request");
    await next();
  });
  app.route("/", managementRoutes);
  const input = {
    name: "Test trip",
    destination: "Test destination",
    description: "Test description",
    type: "fixed",
    departure: "2027-02-28",
    price: 1200000,
    deposit: 300000,
    availabilityNote: "Check supplier",
    itinerary: "Day 1: Arrival",
  };
  const send = () =>
    app.request(
      "https://example.invalid/management/trips",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "trip-create-key-0001",
        },
        body: JSON.stringify(input),
      },
      { DB: db } as any,
    );
  const response = await send();
  expect(response.status).toBe(201);
  const result = (await response.json()) as { id: string };
  const stored = sqlite
    .prepare("SELECT data FROM trips WHERE id=?")
    .get(result.id)!;
  expect(JSON.parse(String(stored.data))).toMatchObject({
    ...input,
    status: "draft",
    version: 1,
    groupVisaPolicy: "review",
  });
  expect(await (await send()).json()).toEqual(result);
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM trips").get()!.n).toBe(2);
});
it("keeps staff unable to create trips and validates date and deposit inputs", async () => {
  const app = new Hono<AppEnv>();
  app.onError((error, c) =>
    c.json(
      { message: error.message },
      (error as { status?: 403 }).status || 500,
    ),
  );
  app.use("*", async (c, next) => {
    c.set("identity", staff);
    await next();
  });
  app.route("/", managementRoutes);
  const minimal = {
    name: "Trip",
    destination: "Destination",
    type: "bespoke",
    description: "",
  };
  const result = await app.request(
    "https://example.invalid/management/trips",
    { method: "POST", body: JSON.stringify(minimal) },
    { DB: db } as any,
  );
  expect(result.status).toBe(403);
  expect(createTripSchema.parse(minimal)).toMatchObject({
    departure: "",
    price: null,
    deposit: null,
    itinerary: "",
  });
  expect(
    createTripSchema.safeParse({ ...minimal, departure: "2027-02-31" }).success,
  ).toBe(false);
  expect(
    createTripSchema.safeParse({ ...minimal, price: 100, deposit: 200 })
      .success,
  ).toBe(false);
});
it("trip edits persist destination and journey type without rewriting accepted quotations", async () => {
  const repository = new Repository(db, { ...staff, role: "manager" });
  await repository.command(
    "SHARED",
    0,
    {
      type: "quote",
      total: 100000,
      deposit: 20000,
      terms: "Original accepted terms",
    },
    "trip-quote",
    "quote",
    "request",
  );
  const before = (await repository.enquiry("SHARED")).quote;
  const trip = (await repository.state()).trips[0];
  await repository.saveTrip(
    {
      ...trip,
      destination: "Updated destination",
      type: "bespoke",
      price: 150000,
      deposit: 30000,
    },
    "edit-full-trip",
    "edit-trip",
    "request",
  );
  expect((await repository.state()).trips[0]).toMatchObject({
    destination: "Updated destination",
    type: "bespoke",
    price: 150000,
    deposit: 30000,
  });
  expect((await repository.enquiry("SHARED")).quote).toEqual(before);
});
it("persists contact and trip edits while preserving original notes", async () => {
  const repository = new Repository(db, staff);
  const before = await repository.enquiry("SHARED");
  await repository.command(
    "SHARED",
    0,
    {
      type: "qualify",
      group: "family",
      visa: "unknown",
      temperature: "warm",
      availability: "pending",
      name: "Fictional Updated",
      email: "updated@example.invalid",
      phone: "+971500000001",
      travellers: 3,
      selfDrive: "yes",
      desiredDeparture: "2027-02-15",
      bookingTimeframe: "Next month",
    },
    "edit-details",
    "edit-fingerprint",
    "edit-request",
  );
  const after = await repository.enquiry("SHARED");
  expect(after).toMatchObject({
    name: "Fictional Updated",
    email: "updated@example.invalid",
    phone: "+971500000001",
    travellers: 3,
    selfDrive: "yes",
    desiredDeparture: "2027-02-15",
    bookingTimeframe: "Next month",
    revision: 1,
  });
  expect(after.originalNote).toBe(before.originalNote);
  expect(
    sqlite
      .prepare("SELECT contact_validity FROM customers WHERE id='SHARED'")
      .get()!.contact_validity,
  ).toBe("submitted");
});
it("rejects contact numbers already used by another customer", async () => {
  sqlite
    .prepare("UPDATE customers SET phone_e164=? WHERE id='PRIVATE'")
    .run("+971500000002");
  const repository = new Repository(db, staff);
  await expect(
    repository.command(
      "SHARED",
      0,
      {
        type: "qualify",
        group: "solo",
        visa: "unknown",
        temperature: "warm",
        availability: "pending",
        phone: "+971500000002",
      },
      "duplicate-contact",
      "duplicate-fingerprint",
      "duplicate-request",
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect((await repository.enquiry("SHARED")).revision).toBe(0);
});
const staff = {
  id: "STAFF-A",
  name: "Fictional staff A",
  role: "staff" as const,
  local: false,
};
it("reuses the chosen customer and preserves their contact details", async () => {
  sqlite
    .prepare("UPDATE customers SET email=?,phone_e164=? WHERE id='SHARED'")
    .run("repeat@example.invalid", "+971500000003");
  const repository = new Repository(db, staff);
  const response = await repository.create(
    {
      name: "Ignored replacement",
      customerId: "SHARED",
      tripId: seed().trips[0].id,
    },
    "repeat-customer",
    "repeat",
    "request",
  );
  expect(await repository.enquiry(String(response.id))).toMatchObject({
    customerId: "SHARED",
    name: "Fictional SHARED",
    email: "repeat@example.invalid",
    phone: "+971500000003",
  });
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM customers").get()!.n).toBe(
    2,
  );
  await expect(
    repository.create(
      { name: "Private", customerId: "PRIVATE", tripId: seed().trips[0].id },
      "private-customer",
      "private",
      "request",
    ),
  ).rejects.toMatchObject({ status: 404 });
});
it("requires a manager to delete and cancels follow-ups while retaining history and customers", async () => {
  const repository = new Repository(db, staff);
  await expect(
    repository.remove("enquiry", "SHARED", 0, "staff-delete", "request"),
  ).rejects.toMatchObject({ status: 403 });
  await repository.command(
    "SHARED",
    0,
    {
      type: "task",
      kind: "Follow-up",
      due: "2027-01-20T10:00:00Z",
      note: "Synthetic follow-up",
    },
    "delete-task",
    "task",
    "request",
  );
  const manager = new Repository(db, { ...staff, role: "manager" });
  await expect(
    manager.remove("enquiry", "SHARED", 0, "stale-delete", "request"),
  ).rejects.toMatchObject({ status: 409 });
  await manager.remove("enquiry", "SHARED", 1, "manager-delete", "request");
  await expect(manager.enquiry("SHARED")).rejects.toMatchObject({
    status: 404,
  });
  expect(
    sqlite.prepare("SELECT status FROM tasks WHERE enquiry_id='SHARED'").get()!
      .status,
  ).toBe("cancelled");
  expect(
    sqlite
      .prepare("SELECT status FROM scheduled_actions WHERE enquiry_id='SHARED'")
      .get()!.status,
  ).toBe("cancelled");
  expect(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM activities WHERE enquiry_id='SHARED'")
      .get()!.n,
  ).toBeGreaterThan(0);
  expect(
    sqlite.prepare("SELECT id FROM customers WHERE id='SHARED'").get(),
  ).toBeTruthy();
  expect(
    await manager.remove("enquiry", "SHARED", 1, "manager-delete", "request"),
  ).toEqual({ ok: true });
  expect(await repository.customers("SHARED")).toEqual([
    expect.objectContaining({ id: "SHARED" }),
  ]);
  expect(await repository.customers("PRIVATE")).toEqual([]);
  const repeat = await repository.create(
    {
      name: "Fictional SHARED",
      customerId: "SHARED",
      tripId: seed().trips[0].id,
    },
    "reuse-deleted-customer",
    "reuse",
    "request",
  );
  expect((await repository.enquiry(String(repeat.id))).customerId).toBe(
    "SHARED",
  );
  await expect(
    repository.command(
      "SHARED",
      2,
      { type: "note", text: "Should not save" },
      "deleted-edit",
      "edit",
      "request",
    ),
  ).rejects.toMatchObject({ status: 404 });
});
it("protects financial records from deletion", async () => {
  const repository = new Repository(db, { ...staff, role: "manager" });
  sqlite
    .prepare(
      "INSERT INTO payments(id,enquiry_id,amount,currency,status,received_at,data) VALUES('PAY','SHARED',100,'AED','pending',?,'{}')",
    )
    .run(new Date().toISOString());
  await expect(
    repository.remove("enquiry", "SHARED", 0, "financial-delete", "request"),
  ).rejects.toMatchObject({ status: 409, code: "DELETE_BLOCKED" });
  expect((await repository.enquiry("SHARED")).revision).toBe(0);
  expect(
    sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM audit_events WHERE action='enquiry.delete'",
      )
      .get()!.n,
  ).toBe(0);
});
it("protects linked trips and prevents reuse of deleted trips", async () => {
  const repository = new Repository(db, { ...staff, role: "manager" });
  const trip = seed().trips[0];
  await expect(
    repository.remove("trip", trip.id, trip.version, "linked-trip", "request"),
  ).rejects.toMatchObject({ status: 409 });
  const empty = { ...trip, id: "EMPTY" };
  sqlite
    .prepare("INSERT INTO trips(id,name,version,data) VALUES(?,?,?,?)")
    .run(empty.id, empty.name, empty.version, JSON.stringify(empty));
  await repository.remove(
    "trip",
    empty.id,
    empty.version,
    "empty-trip",
    "request",
  );
  expect((await repository.state()).trips.some((t) => t.id === empty.id)).toBe(
    false,
  );
  await expect(
    repository.saveTrip(empty, "restore-edit", "restore", "request"),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    repository.create(
      { name: "New", tripId: empty.id },
      "deleted-trip-create",
      "new",
      "request",
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect(() =>
    sqlite
      .prepare("UPDATE enquiries SET trip_id='EMPTY' WHERE id='SHARED'")
      .run(),
  ).toThrow(/Trip is deleted/);
  expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
it("shares team enquiries across staff while preserving private ownership boundaries", async () => {
  const repository = new Repository(db, staff),
    state = await repository.state();
  expect(state.enquiries.map((e) => e.id)).toEqual(["SHARED"]);
  expect((await repository.enquiry("SHARED")).owner).toBe("Shared team");
  await expect(repository.enquiry("PRIVATE")).rejects.toMatchObject({
    status: 404,
  });
});
it("allows shared operational updates without granting manager financial permissions", async () => {
  const repository = new Repository(db, staff);
  await repository.command(
    "SHARED",
    0,
    {
      type: "stage",
      stage: "QUALIFYING",
      reason: "Fictional shared follow-up",
    },
    "shared-stage",
    "fingerprint",
    "request",
  );
  expect((await repository.enquiry("SHARED")).stage).toBe("QUALIFYING");
  await expect(
    repository.command(
      "SHARED",
      1,
      { type: "reverse", paymentId: "fictional", reason: "Not authorized" },
      "shared-reverse",
      "fingerprint",
      "request",
    ),
  ).rejects.toMatchObject({ status: 403 });
});
