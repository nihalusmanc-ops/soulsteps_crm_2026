import { reviewStorage } from "../src/jobs/storage";
import { ImportService } from "../src/server/import-service";
import {
  acceptMetaEvent,
  processMetaLead,
  sweepMeta,
  reconcileMetaForm,
} from "../src/server/meta-service";
import {
  syntheticPage,
  syntheticForm,
  syntheticLead,
  type MetaMapping,
} from "../src/shared/meta";
import { app } from "../src/server/index";
import { createHmac } from "node:crypto";
import { operationalReadiness } from "../src/server/release";
import importFixture from "../public/samples/import-preview.json";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { readdirSync, readFileSync } from "node:fs";
import { Repository } from "../src/server/repository";
import { sweep, processJob } from "../src/jobs/service";
import type { Bindings } from "../src/server/types";
import {
  defaultSettings,
  settingsSchema,
  defaultRules,
  evaluateRules,
  rulesSchema,
} from "../src/shared/management";
import { seed } from "../src/shared/seed";
import { digest } from "../src/server/request";
let runtime: Miniflare,
  env: Bindings,
  repo: Repository,
  ids: string[],
  enquiryId: string;
beforeEach(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-10-01",
      d1Databases: { DB: "jobs-test" },
      r2Buckets: ["FILES_BUCKET"],
    }),
  );
  const db = await runtime.getD1Database("DB");
  for (const file of readdirSync("drizzle/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const statements = unstable_splitSqlQuery(
      readFileSync("drizzle/migrations/" + file, "utf8"),
    );
    await db.batch(statements.map((sql) => db.prepare(sql)));
  }
  ids = [];
  env = {
    DB: db as unknown as D1Database,
    FILES_BUCKET: (await runtime.getR2Bucket(
      "FILES_BUCKET",
    )) as unknown as R2Bucket,
    APP_ENV: "local",
    JOBS_QUEUE: {
      send: async (message: { id: string }) => {
        ids.push(message.id);
      },
    } as unknown as Queue<{ id: string }>,
  } as Bindings;
  for (const [id, role] of [
    ["staff", "staff"],
    ["manager", "manager"],
  ])
    await db
      .prepare(
        "INSERT INTO users(id,email,role,active,display_name) VALUES(?,?,?,1,?)",
      )
      .bind(id, id + "@example.invalid", role, id)
      .run();
  const trip = seed().trips[0];
  await db
    .prepare("INSERT INTO trips(id,name,version,data) VALUES(?,?,?,?)")
    .bind(trip.id, trip.name, 1, JSON.stringify(trip))
    .run();
  repo = new Repository(env.DB, {
    id: "manager",
    name: "Manager test fixture",
    role: "manager",
    local: true,
  });
  const result = await repo.create(
    { name: "Synthetic job traveller", tripId: trip.id },
    crypto.randomUUID(),
    "create",
    "test",
  );
  enquiryId = String(result.id);
}, 30000);
afterEach(async () => {
  await runtime?.dispose();
});

describe("release diagnostics and database access", () => {
  it("reports real local state without fabricating release approval or cloud spending", async () => {
    const report = await operationalReadiness(env, true);
    expect(report.releaseApproved).toBeNull();
    expect(report.cloudBilling).toMatchObject({
      verified: false,
      spend: null,
      alertsConfigured: null,
    });
    expect(report.metrics.enquiries).toBe(1);
    expect(report.checks.find((c) => c.id === "mode")?.status).toBe("blocked");
    expect(report.checks.find((c) => c.id === "indexes")?.status).toBe("pass");
  });
  it("uses enquiry/customer and task/enquiry indexes for scoped lookups", async () => {
    const plans = await env.DB.batch<{ detail: string }>([
      env.DB.prepare(
        "EXPLAIN QUERY PLAN SELECT id FROM enquiries WHERE customer_id=?",
      ).bind("fictional"),
      env.DB.prepare(
        "EXPLAIN QUERY PLAN SELECT id FROM tasks WHERE enquiry_id=? AND status='pending' ORDER BY due_at",
      ).bind(enquiryId),
    ]);
    expect(plans[0].results.map((r) => r.detail).join(" ")).toContain(
      "enquiry_customer",
    );
    expect(plans[1].results.map((r) => r.detail).join(" ")).toContain(
      "task_enquiry_status_due",
    );
  });
});

describe("Meta durable lead intake", () => {
  const id = "990000000000123";
  const event = (leadId = id, formId = syntheticForm) => ({
    object: "page",
    entry: [
      {
        id: syntheticPage,
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: leadId,
              page_id: syntheticPage,
              form_id: formId,
              created_time: 1792836000,
              ad_id: "990000000000003",
            },
          },
        ],
      },
    ],
  });
  const mapping = (): MetaMapping => ({
    pageId: syntheticPage,
    formId: syntheticForm,
    version: 1,
    schemaVersion: "v3",
    tripId: seed().trips[0].id,
    ownerId: "staff",
    enabled: true,
    reviewed: true,
    reason: "Reviewed fictional form mapping",
    fields: {
      name: "full_name",
      phone: "phone_number",
      email: "email",
      group: "group",
      visa: "visa",
      decisionTimeframe: "booking_timeframe",
      travelSelection: "travel_selection",
    },
  });
  async function mapped() {
    const m = mapping();
    await env.DB.prepare(
      "INSERT INTO meta_forms(id,page_id,form_id,version,data) VALUES(?,?,?,1,?)",
    )
      .bind(
        `${syntheticPage}:${syntheticForm}`,
        syntheticPage,
        syntheticForm,
        JSON.stringify(m),
      )
      .run();
    return m;
  }
  const row = () =>
    env.DB.prepare("SELECT * FROM meta_leads WHERE id=?").bind(id).first<{
      status: string;
      attempts: number;
      enquiry_id: string | null;
      payload: string | null;
      last_error: string | null;
    }>();
  const due = () =>
    env.DB.prepare(
      "UPDATE meta_leads SET next_retry_at='2000-01-01T00:00:00.000Z' WHERE id=?",
    )
      .bind(id)
      .run();
  function live() {
    Object.assign(env, {
      APP_ENV: "production",
      META_LIVE_INTAKE_ENABLED: "true",
      META_APP_SECRET: "fictional-app-secret-never-production",
      META_VERIFY_TOKEN: "fictional-verify-token",
      META_PAGE_ID: syntheticPage,
      META_PAGE_ACCESS_TOKEN: "fictional-page-token",
      META_GRAPH_VERSION: "v25.0",
    });
  }
  it("verifies raw signatures before writes and exposes only the exact public webhook", async () => {
    const body = JSON.stringify(event());
    expect(
      (
        await app.request(
          "http://localhost/webhooks/meta/leads",
          { method: "POST", body },
          env,
        )
      ).status,
    ).toBe(503);
    live();
    expect(
      (
        await app.request(
          "http://localhost/webhooks/meta/leads?hub.mode=subscribe&hub.verify_token=fictional-verify-token&hub.challenge=123",
          {},
          env,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(
          "http://localhost/webhooks/meta/leads?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123",
          {},
          env,
        )
      ).status,
    ).toBe(403);
    const signature =
      "sha256=" +
      createHmac("sha256", env.META_APP_SECRET!).update(body).digest("hex");
    expect(
      (
        await app.request(
          "http://localhost/webhooks/meta/leads",
          {
            method: "POST",
            headers: { "X-Hub-Signature-256": signature },
            body: body + " ",
          },
          env,
        )
      ).status,
    ).toBe(403);
    expect(await row()).toBeNull();
    const response = await app.request(
      "http://localhost/webhooks/meta/leads",
      { method: "POST", headers: { "X-Hub-Signature-256": signature }, body },
      env,
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as { accepted: number }).accepted).toBe(1);
    const repeat = await app.request(
      "http://localhost/webhooks/meta/leads",
      { method: "POST", headers: { "X-Hub-Signature-256": signature }, body },
      env,
    );
    expect(((await repeat.json()) as { accepted: number }).accepted).toBe(0);
    expect((await row())?.status).toBe("pending");
    expect((await repo.state()).enquiries).toHaveLength(1);
    expect(
      (await app.request("http://localhost/webhooks/meta/unexpected", {}, env))
        .status,
    ).toBe(404);
  });
  it("deduplicates webhook, queue retries and historical connector imports with source provenance", async () => {
    await mapped();
    await acceptMetaEvent(env, event(), "synthetic");
    await acceptMetaEvent(env, event(), "synthetic");
    expect((await sweepMeta(env)).dispatched).toBe(1);
    expect(ids).toContain(`meta:${id}`);
    await Promise.all([processMetaLead(env, id), processMetaLead(env, id)]);
    const result = await row();
    expect(result?.status).toBe("completed");
    const e = await repo.enquiry(result!.enquiry_id!);
    expect(e).toMatchObject({
      source: "Meta lead ad",
      rank: null,
      temperature: "unassessed",
      phone: null,
      stage: "NEW",
    });
    expect(e.tasks).toEqual([]);
    expect(e.payments).toEqual([]);
    expect(e.booking).toBeUndefined();
    expect(JSON.parse(result!.payload!).campaign_id).toBe("990000000000005");
    expect(e.originalNote).toContain("booking_timeframe: Considering later");
    expect(e.originalNote).toContain("travel_selection: Not selected");
    expect(e.activities[0].actor).toBe("Meta lead ad");
    const fixture = structuredClone(importFixture);
    fixture.rows[0].cells[0] = id;
    const svc = new ImportService(env, {
      id: "manager",
      name: "Manager",
      role: "manager",
      local: true,
    });
    let batch = await svc.upload(JSON.stringify(fixture));
    batch = await svc.review(batch.id, batch.rows[0].id, {
      revision: 0,
      tripId: seed().trips[0].id,
      ownerId: "staff",
      acknowledged: true,
      verifiedPhone: false,
      reason: "Reviewed historical connector duplicate",
    });
    batch = await svc.commit(batch.id, [batch.rows[0].id]);
    expect(batch.rows[0].status).toBe("skip");
    expect(batch.rows[0].enquiry_id).toBe(e.id);
    expect((await repo.state()).enquiries).toHaveLength(2);
  });
  it("retains a complete submitted phone for manual staff use without silently matching or verifying ownership", async () => {
    await mapped();
    await acceptMetaEvent(env, event(), "synthetic");
    const lead = syntheticLead(id);
    lead.field_data.find((f) => f.name === "phone_number")!.values = [
      "+12025550123",
    ];
    const existing = await repo.enquiry(enquiryId);
    await env.DB.prepare(
      "UPDATE customers SET phone_e164='+12025550123',contact_validity='verified' WHERE id=?",
    )
      .bind(existing.customerId)
      .run();
    await env.DB.prepare("UPDATE meta_leads SET payload=? WHERE id=?")
      .bind(JSON.stringify(lead), id)
      .run();
    await processMetaLead(env, id);
    const result = await row(),
      e = await repo.enquiry(result!.enquiry_id!);
    expect(e.phone).toBe("+12025550123");
    expect(e.customerId).not.toBe(existing.customerId);
    expect(
      (await env.DB.prepare("SELECT contact_validity FROM customers WHERE id=?")
        .bind(e.customerId)
        .first<{ contact_validity: string }>())!.contact_validity,
    ).toBe("submitted");
    expect(e.activities[0].text).toContain("no messaging consent inferred");
  });
  it("preserves unknown-form payload and reprocesses it after reviewed mapping", async () => {
    await acceptMetaEvent(env, event(), "synthetic");
    await processMetaLead(env, id);
    expect((await row())?.status).toBe("review");
    expect((await row())?.payload).toBeTruthy();
    await mapped();
    await env.DB.prepare(
      "UPDATE meta_leads SET status='pending',attempts=0 WHERE id=?",
    )
      .bind(id)
      .run();
    await processMetaLead(env, id);
    expect((await row())?.status).toBe("completed");
    expect((await repo.state()).enquiries).toHaveLength(2);
  });
  it("backs off transient failures and succeeds once without duplicate effects", async () => {
    await mapped();
    await acceptMetaEvent(env, event(), "synthetic", "retry");
    await processMetaLead(env, id);
    expect(await row()).toMatchObject({ status: "pending", attempts: 1 });
    await processMetaLead(env, id);
    expect((await row())?.attempts).toBe(1);
    await due();
    await processMetaLead(env, id);
    expect(await row()).toMatchObject({ status: "completed", attempts: 2 });
  });
  it("bounds provider failures, pins Graph URLs and keeps tokens out of query strings", async () => {
    live();
    await mapped();
    await acceptMetaEvent(env, event());
    let calls = 0;
    const failing = (async (
      input: RequestInfo | URL,
      options?: RequestInit,
    ) => {
      calls++;
      const url = new URL(String(input));
      expect(url.origin).toBe("https://graph.facebook.com");
      expect(url.search).not.toContain("token");
      expect(options?.headers).toEqual({
        Authorization: "Bearer fictional-page-token",
      });
      return new Response("private error must not be stored", { status: 429 });
    }) as typeof fetch;
    for (let i = 0; i < 6; i++) {
      await due();
      await processMetaLead(env, id, failing);
    }
    expect(calls).toBe(5);
    expect((await row())?.status).toBe("failed");
    expect((await row())?.last_error).not.toContain("private");
  });
  it("recovers queue handoff and expired leases while honouring pause", async () => {
    await mapped();
    await acceptMetaEvent(env, event(), "synthetic");
    const queue = env.JOBS_QUEUE;
    env.JOBS_QUEUE = {
      send: async () => {
        throw new Error("fixture queue failure");
      },
    } as unknown as Bindings["JOBS_QUEUE"];
    await sweepMeta(env);
    expect(await row()).toMatchObject({ status: "pending", attempts: 1 });
    env.JOBS_QUEUE = queue;
    await due();
    await sweepMeta(env);
    await env.DB.prepare(
      "UPDATE meta_leads SET lease_until='2000-01-01T00:00:00.000Z' WHERE id=?",
    )
      .bind(id)
      .run();
    await sweepMeta(env);
    expect((await row())?.status).toBe("queued");
    await env.DB.prepare(
      "UPDATE workspace_settings SET data=json_set(data,'$.jobsPaused',json('true'))",
    ).run();
    expect((await sweepMeta(env)).paused).toBe(true);
    await processMetaLead(env, id);
    expect((await repo.state()).enquiries).toHaveLength(1);
    await env.DB.prepare(
      "UPDATE workspace_settings SET data=json_set(data,'$.jobsPaused',json('false'))",
    ).run();
    await processMetaLead(env, id);
    expect((await row())?.status).toBe("completed");
  });
  it("quarantines mismatched provider identity and preserves its response", async () => {
    live();
    await mapped();
    await acceptMetaEvent(env, event());
    await processMetaLead(env, id, (async () =>
      Response.json(syntheticLead("990000000000999"))) as typeof fetch);
    expect((await row())?.status).toBe("review");
    expect((await row())?.payload).toContain("990000000000999");
    expect((await repo.state()).enquiries).toHaveLength(1);
  });
  it("reconciles bounded form pages using cursors without following provider next URLs", async () => {
    live();
    const map = await mapped();
    let calls = 0;
    const result = await reconcileMetaForm(env, map, "safe-cursor", (async (
      input: RequestInfo | URL,
    ) => {
      calls++;
      const url = new URL(String(input));
      expect(url.origin).toBe("https://graph.facebook.com");
      expect(url.pathname).toBe(`/v25.0/${syntheticForm}/leads`);
      expect(url.searchParams.get("after")).toBe("safe-cursor");
      return Response.json({
        data: [{ id }],
        paging: {
          cursors: { after: "next-cursor" },
          next: "https://evil.invalid/never-follow",
        },
      });
    }) as typeof fetch);
    expect(calls).toBe(1);
    expect(result).toMatchObject({
      accepted: 1,
      scanned: 1,
      nextCursor: "next-cursor",
    });
    expect((await row())?.status).toBe("pending");
  });
});

describe("persistent historical imports", () => {
  const service = () =>
    new ImportService(env, {
      id: "manager",
      name: "Manager fixture",
      role: "manager",
      local: true,
    });
  async function ready(
    text = JSON.stringify(importFixture),
    verifiedPhone = false,
  ) {
    const svc = service(),
      batch = await svc.upload(text),
      row = batch.rows[0];
    const updated = await svc.review(batch.id, row.id, {
      revision: row.revision,
      tripId: seed().trips[0].id,
      ownerId: "staff",
      acknowledged: true,
      verifiedPhone,
      reason: "Reviewed fictional source; keep ambiguous history raw.",
    });
    return { svc, batch: updated, row: updated.rows[0] };
  }
  it("persists source evidence, excludes dummy/unknown rows, and commits only explicitly reviewed rows", async () => {
    const { svc, batch, row } = await ready();
    expect((await svc.upload(JSON.stringify(importFixture))).id).toBe(batch.id);
    const original = await env.DB.prepare(
      "SELECT raw_text,object_key FROM import_batches WHERE id=?",
    )
      .bind(batch.id)
      .first<{ raw_text: string; object_key: string }>();
    expect(original!.raw_text).toBe(JSON.stringify(importFixture));
    expect(await env.FILES_BUCKET.head(original!.object_key)).toBeTruthy();
    for (const blocked of batch.rows.slice(2))
      await expect(
        svc.review(batch.id, blocked.id, {
          revision: 0,
          tripId: seed().trips[0].id,
          ownerId: "staff",
          acknowledged: true,
          verifiedPhone: false,
          reason: "Cannot approve dummy or unknown",
        }),
      ).rejects.toThrow();
    const committed = await svc.commit(batch.id, [row.id]);
    expect(committed.counts).toEqual({
      review: 2,
      ready: 0,
      committed: 1,
      skip: 1,
    });
    const e = await repo.enquiry(committed.rows[0].enquiry_id!);
    expect(e).toMatchObject({
      stage: "NEW",
      temperature: "unassessed",
      rank: null,
      phone: null,
    });
    expect(e.tasks).toEqual([]);
    expect(e.payments).toEqual([]);
    expect(e.booking).toBeUndefined();
    expect(e.originalNote).toContain("Wednesday");
    expect(e.activities[0].actor).toBe("Historical import");
    await svc.commit(batch.id, [row.id]);
    expect((await repo.state()).enquiries).toHaveLength(2);
  });
  it("re-import preserves newer staff history and never overwrites an enquiry", async () => {
    const { svc, batch, row } = await ready();
    const committed = await svc.commit(batch.id, [row.id]);
    const id = committed.rows[0].enquiry_id!,
      e = await repo.enquiry(id);
    await repo.command(
      id,
      e.revision,
      { type: "note", text: "Newer staff note must survive" },
      crypto.randomUUID(),
      "staff-note",
      "test",
    );
    const changed = structuredClone(importFixture);
    changed.rows[0].cells.push("Changed legacy note");
    const next = await ready(JSON.stringify(changed));
    const result = await svc.commit(next.batch.id, [next.row.id]);
    expect(result.rows[0].status).toBe("skip");
    expect(result.rows[0].enquiry_id).toBe(id);
    expect(
      (await repo.enquiry(id)).activities.some((a) =>
        a.text.includes("Newer staff note"),
      ),
    ).toBe(true);
    expect((await repo.enquiry(id)).originalNote).not.toContain(
      "Changed legacy",
    );
  });
  it("concurrent retries create one source and one enquiry", async () => {
    const { svc, batch, row } = await ready();
    await Promise.all([
      svc.commit(batch.id, [row.id]),
      svc.commit(batch.id, [row.id]),
    ]);
    expect((await repo.state()).enquiries).toHaveLength(2);
    expect((await svc.batch(batch.id)).rows[0].status).toBe("committed");
  });
  it("an activity failure rolls back customer, enquiry and source and remains retryable", async () => {
    const { svc, batch, row } = await ready();
    await env.DB.prepare(
      "CREATE TRIGGER import_test_failure BEFORE INSERT ON activities BEGIN SELECT RAISE(ABORT,'fixture failure'); END",
    ).run();
    const result = await svc.commit(batch.id, [row.id]);
    expect(result.rows[0].status).toBe("ready");
    expect(result.rows[0].error).toContain("No partial row writes");
    expect((await repo.state()).enquiries).toHaveLength(1);
    expect(
      (await env.DB.prepare("SELECT COUNT(*) AS n FROM customers").first<{
        n: number;
      }>())!.n,
    ).toBe(1);
    await env.DB.prepare("DROP TRIGGER import_test_failure").run();
    expect((await svc.commit(batch.id, [row.id])).rows[0].status).toBe(
      "committed",
    );
  });
  it("matches only verified full phone evidence; repeat lead gets a separate enquiry", async () => {
    const source = structuredClone(importFixture);
    source.rows[0].cells[3] = "+12025550123";
    const first = await ready(JSON.stringify(source), true);
    const a = await first.svc.commit(first.batch.id, [first.row.id]);
    source.rows[0].cells[0] = "90071992547409939";
    const second = await ready(JSON.stringify(source), true);
    const b = await second.svc.commit(second.batch.id, [second.row.id]);
    const e1 = await repo.enquiry(a.rows[0].enquiry_id!),
      e2 = await repo.enquiry(b.rows[0].enquiry_id!);
    expect(e1.customerId).toBe(e2.customerId);
    expect(e1.id).not.toBe(e2.id);
    source.rows[0].cells[0] = "90071992547409940";
    source.rows[0].cells[2] = "Different fictional person";
    const conflict = await ready(JSON.stringify(source), true);
    const result = await conflict.svc.commit(conflict.batch.id, [
      conflict.row.id,
    ]);
    expect(result.rows[0].status).toBe("review");
    expect(result.rows[0].error).toContain("conflicts");
  });
});
async function task(hours = -1) {
  const e = await repo.enquiry(enquiryId);
  await repo.command(
    e.id,
    e.revision,
    {
      type: "task",
      due: new Date(Date.now() + hours * 3600000).toISOString(),
      kind: "Callback",
      note: "Synthetic reliability fixture",
    },
    crypto.randomUUID(),
    crypto.randomUUID(),
    "test",
  );
  return (await repo.enquiry(enquiryId)).tasks.at(-1)!;
}
async function configure(patch: Record<string, unknown>) {
  await env.DB.prepare(
    "UPDATE workspace_settings SET data=? WHERE id='workspace'",
  )
    .bind(JSON.stringify({ ...defaultSettings, ...patch }))
    .run();
}
const getJob = (id: string) =>
  env.DB.prepare("SELECT * FROM scheduled_actions WHERE id=?")
    .bind(id)
    .first<Record<string, unknown>>();
describe("persistent jobs in real D1 and R2", () => {
  it("commits an outbox record with the task and deduplicates repeated processing", async () => {
    const t = await task();
    expect(await getJob("task:" + t.id)).toMatchObject({ status: "pending" });
    await sweep(env, { includeDailyBackup: false });
    expect(ids).toEqual(["task:" + t.id]);
    await processJob(env, ids[0]);
    await processJob(env, ids[0]);
    expect(await getJob(ids[0])).toMatchObject({
      status: "succeeded",
      attempts: 1,
    });
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM in_app_notifications",
    ).first<{ count: number }>();
    expect(count?.count).toBe(1);
    expect((await repo.enquiry(enquiryId)).tasks).toHaveLength(1);
  });
  it("dispatches overdue tasks backfilled during this same sweep", async () => {
    const t = await task();
    await env.DB.prepare("DELETE FROM scheduled_actions WHERE id=?")
      .bind("task:" + t.id)
      .run();
    await sweep(env, { includeDailyBackup: false });
    expect(ids).toContain("task:" + t.id);
  });
  it("recovers a failed queue handoff from the persisted outbox", async () => {
    const t = await task();
    env.JOBS_QUEUE = {
      send: async () => {
        throw new Error("Synthetic queue outage");
      },
    } as unknown as Queue<{ id: string }>;
    await sweep(env, { includeDailyBackup: false });
    expect(await getJob("task:" + t.id)).toMatchObject({
      status: "pending",
      last_error: "Queue handoff failed; the outbox will retry.",
    });
    await env.DB.prepare(
      "UPDATE scheduled_actions SET next_retry_at='2000-01-01T00:00:00.000Z'",
    ).run();
    env.JOBS_QUEUE = {
      send: async (m: { id: string }) => {
        ids.push(m.id);
      },
    } as unknown as Queue<{ id: string }>;
    await sweep(env, { includeDailyBackup: false });
    await processJob(env, ids[0]);
    expect(await getJob(ids[0])).toMatchObject({
      status: "succeeded",
      dispatch_attempts: 2,
    });
  });
  it("cancels superseded queued work before its effect", async () => {
    const old = await task();
    await sweep(env, { includeDailyBackup: false });
    const e = await repo.enquiry(enquiryId);
    await repo.command(
      e.id,
      e.revision,
      {
        type: "task",
        due: new Date(Date.now() - 1000).toISOString(),
        kind: "Callback",
        note: "Rescheduled",
        replaces: old.id,
      },
      crypto.randomUUID(),
      "reschedule",
      "test",
    );
    await processJob(env, "task:" + old.id);
    expect(await getJob("task:" + old.id)).toMatchObject({
      status: "cancelled",
    });
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM in_app_notifications",
      ).first<{ n: number }>(),
    ).toMatchObject({ n: 0 });
    const updated = await repo.enquiry(enquiryId);
    await repo.command(
      updated.id,
      updated.revision,
      { type: "stage", stage: "ON_HOLD", reason: "Future travel" },
      crypto.randomUUID(),
      "hold",
      "test",
    );
    await sweep(env, { includeDailyBackup: false });
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM scheduled_actions WHERE status NOT IN ('cancelled','succeeded')",
        ).first<{ n: number }>()
      )?.n,
    ).toBe(0);
  });
  it("exposes exhausted failures without dropping the job", async () => {
    await configure({ maxAttempts: 1 });
    const t = await task();
    env.JOBS_QUEUE = {
      send: async () => {
        throw new Error("Synthetic outage");
      },
    } as unknown as Queue<{ id: string }>;
    await sweep(env, { includeDailyBackup: false });
    expect(await getJob("task:" + t.id)).toMatchObject({
      status: "failed",
      dispatch_attempts: 1,
    });
    expect(
      (await env.DB.prepare("SELECT COUNT(*) AS n FROM job_attempts").first<{
        n: number;
      }>())!.n,
    ).toBeGreaterThan(0);
  });
  it("recovers an expired queue lease without duplicate reminders", async () => {
    const t = await task();
    await sweep(env, { includeDailyBackup: false });
    await env.DB.prepare(
      "UPDATE scheduled_actions SET lease_until='2000-01-01T00:00:00.000Z'",
    ).run();
    await sweep(env, { includeDailyBackup: false });
    expect(ids).toHaveLength(2);
    await Promise.all([
      processJob(env, "task:" + t.id),
      processJob(env, "task:" + t.id),
    ]);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM in_app_notifications",
      ).first<{ n: number }>(),
    ).toMatchObject({ n: 1 });
  });
  it("holds recovered work until explicit review", async () => {
    const t = await task();
    await configure({ jobsPaused: true, recoveryHold: true });
    await processJob(env, "task:" + t.id);
    expect(await getJob("task:" + t.id)).toMatchObject({ status: "held" });
    expect(await sweep(env)).toEqual({ paused: true, dispatched: 0 });
    expect(ids).toHaveLength(0);
  });
  it("honours the configured early in-app reminder window", async () => {
    await configure({ reminderMinutes: 30 });
    const t = await task(0.3);
    await sweep(env, { includeDailyBackup: false });
    expect(ids).toContain("task:" + t.id);
    await processJob(env, "task:" + t.id);
    expect(await getJob("task:" + t.id)).toMatchObject({ status: "succeeded" });
  });
  it("creates checksummed private database and receipt copies", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 synthetic backup test");
    const fileId = crypto.randomUUID(),
      key = "receipts/test.pdf";
    await env.FILES_BUCKET.put(key, bytes);
    await env.DB.prepare(
      "INSERT INTO files(id,enquiry_id,object_key,name,mime,size,created_at,uploaded_by) VALUES(?,?,?,?,?,?,?,?)",
    )
      .bind(
        fileId,
        enquiryId,
        key,
        "synthetic.pdf",
        "application/pdf",
        bytes.byteLength,
        new Date().toISOString(),
        "manager",
      )
      .run();
    await sweep(env);
    const id = ids.find((id) => id.startsWith("backup:"))!;
    await processJob(env, id);
    await processJob(env, id);
    const backup = await env.DB.prepare("SELECT * FROM backup_runs WHERE id=?")
      .bind(id)
      .first<{ status: string; object_key: string; checksum: string }>();
    expect(backup?.status).toBe("succeeded");
    const payload = await (await env.FILES_BUCKET.get(
      backup!.object_key,
    ))!.text();
    expect(await digest(payload)).toBe(backup!.checksum);
    const parsed = JSON.parse(payload);
    expect(parsed.tables.enquiries).toHaveLength(1);
    expect(parsed.tables.trip_content_versions).toEqual([]);
    const receipt = parsed.receipts[0];
    expect(receipt.checksum).toBe(await digest(bytes.buffer));
    expect(
      await (await env.FILES_BUCKET.get(receipt.backupKey))!.text(),
    ).toContain("synthetic backup test");
  });
  it("checkpoints larger receipt sets across invocations", async () => {
    for (let i = 0; i < 9; i++) {
      const id = crypto.randomUUID(),
        key = "receipts/chunk-" + i + ".pdf",
        bytes = new TextEncoder().encode("%PDF-1.4 synthetic chunk " + i);
      await env.FILES_BUCKET.put(key, bytes);
      await env.DB.prepare(
        "INSERT INTO files(id,enquiry_id,object_key,name,mime,size,created_at,uploaded_by) VALUES(?,?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          enquiryId,
          key,
          "synthetic.pdf",
          "application/pdf",
          bytes.byteLength,
          new Date().toISOString(),
          "manager",
        )
        .run();
    }
    await sweep(env);
    const id = ids.find((id) => id.startsWith("backup:"))!;
    await processJob(env, id);
    expect(await getJob(id)).toMatchObject({ status: "pending" });
    await processJob(env, id);
    expect(
      await env.DB.prepare("SELECT cursor,status FROM backup_runs WHERE id=?")
        .bind(id)
        .first(),
    ).toMatchObject({ cursor: 8, status: "processing" });
    await processJob(env, id);
    const row = await env.DB.prepare(
      "SELECT cursor,status,receipt_manifest FROM backup_runs WHERE id=?",
    )
      .bind(id)
      .first<{ cursor: number; status: string; receipt_manifest: string }>();
    expect(row?.status).toBe("succeeded");
    expect(row?.cursor).toBe(9);
    expect(
      new Set(
        JSON.parse(row!.receipt_manifest).map((r: { id: string }) => r.id),
      ).size,
    ).toBe(9);
  });
  it("reports missing receipt references without deleting new unlinked uploads", async () => {
    await env.FILES_BUCKET.put("receipts/new-unlinked.pdf", "synthetic upload");
    await env.DB.prepare(
      "INSERT INTO files(id,enquiry_id,object_key,name,mime,size,created_at,uploaded_by) VALUES(?,?,?,?,?,?,?,?)",
    )
      .bind(
        crypto.randomUUID(),
        enquiryId,
        "receipts/missing.pdf",
        "synthetic.pdf",
        "application/pdf",
        10,
        new Date().toISOString(),
        "manager",
      )
      .run();
    const report = await reviewStorage(env);
    expect(report.missing).toHaveLength(1);
    expect(report.unlinked).toEqual([]);
    expect(report.automaticDeletion).toBe(false);
    expect(
      await env.FILES_BUCKET.head("receipts/new-unlinked.pdf"),
    ).toBeTruthy();
  });
  it("keeps a missing-receipt backup failure visible", async () => {
    await configure({ maxAttempts: 1 });
    await env.DB.prepare(
      "INSERT INTO files(id,enquiry_id,object_key,name,mime,size,created_at,uploaded_by) VALUES(?,?,?,?,?,?,?,?)",
    )
      .bind(
        crypto.randomUUID(),
        enquiryId,
        "missing.pdf",
        "synthetic.pdf",
        "application/pdf",
        10,
        new Date().toISOString(),
        "manager",
      )
      .run();
    await sweep(env);
    const id = ids.find((id) => id.startsWith("backup:"))!;
    await processJob(env, id);
    await processJob(env, id);
    expect(await getJob(id)).toMatchObject({ status: "failed", attempts: 1 });
    expect(
      await env.DB.prepare("SELECT status FROM backup_runs WHERE id=?")
        .bind(id)
        .first(),
    ).toMatchObject({ status: "failed" });
  });
});
describe("reviewable settings and rules", () => {
  it("keeps valid readable defaults and rejects bright badges / outbound sends", () => {
    expect(settingsSchema.safeParse(defaultSettings).success).toBe(true);
    expect(
      settingsSchema.safeParse({ ...defaultSettings, outboundEnabled: true })
        .success,
    ).toBe(false);
    expect(
      settingsSchema.safeParse({
        ...defaultSettings,
        stages: {
          ...defaultSettings.stages,
          NEW: { label: "New", color: "#eeeeee" },
        },
      }).success,
    ).toBe(false);
  });
  it("rejects overlapping conditions and leaves unknown/mixed inputs unresolved", () => {
    expect(
      rulesSchema.safeParse([...defaultRules, defaultRules[0]]).success,
    ).toBe(false);
    expect(evaluateRules(defaultRules, "solo", "all").rank).toBe("P4");
    expect(evaluateRules(defaultRules, "family", "all").rank).toBeNull();
    expect(evaluateRules(defaultRules, "couple", "some").rank).toBeNull();
  });
});
