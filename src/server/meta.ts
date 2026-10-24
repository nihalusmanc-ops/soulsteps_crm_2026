import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { AppEnv } from "./types";
import { requireManager, localFixtureAllowed } from "./auth";
import { ApiError } from "./errors";
import {
  metaMappingSchema,
  metaId,
  syntheticPage,
  syntheticForm,
} from "../shared/meta";
import {
  acceptMetaEvent,
  metaCredentialsReady,
  verifyMetaSignature,
  sweepMeta,
  reconcileMetaForm,
} from "./meta-service";
export const metaPublic = new Hono<AppEnv>();
metaPublic.use(
  "*",
  bodyLimit({
    maxSize: 262144,
    onError: (c) => c.json({ message: "Webhook limit is 256 KB." }, 413),
  }),
);
metaPublic.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  await next();
});
metaPublic.get("/leads", async (c) => {
  if (
    c.env.META_LIVE_INTAKE_ENABLED !== "true" ||
    !c.env.META_VERIFY_TOKEN ||
    c.env.APP_ENV === "local"
  )
    throw new ApiError(503, "META_DISABLED", "Live Meta intake is disabled.");
  const supplied = c.req.query("hub.verify_token") || "";
  // Use HMAC verification for fixed-work secret comparison, without logging query tokens.
  const encoder = new TextEncoder(),
    key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(c.env.META_VERIFY_TOKEN),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(c.env.META_VERIFY_TOKEN),
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signed,
    encoder.encode(supplied),
  );
  const challenge = c.req.query("hub.challenge") || "";
  if (
    c.req.query("hub.mode") !== "subscribe" ||
    !valid ||
    !challenge ||
    challenge.length > 2000
  )
    throw new ApiError(
      403,
      "META_VERIFICATION",
      "Webhook verification failed.",
    );
  return c.text(challenge);
});
metaPublic.post("/leads", async (c) => {
  if (
    c.env.META_LIVE_INTAKE_ENABLED !== "true" ||
    !c.env.META_APP_SECRET ||
    c.env.APP_ENV === "local"
  )
    throw new ApiError(503, "META_DISABLED", "Live Meta intake is disabled.");
  const bytes = await c.req.arrayBuffer();
  if (
    !(await verifyMetaSignature(
      bytes,
      c.req.header("X-Hub-Signature-256"),
      c.env.META_APP_SECRET,
    ))
  )
    throw new ApiError(403, "META_SIGNATURE", "Invalid webhook signature.");
  const result = await acceptMetaEvent(
    c.env,
    JSON.parse(new TextDecoder().decode(bytes)),
  );
  try {
    c.executionCtx.waitUntil(sweepMeta(c.env));
  } catch {
    /* Cron recovers when no request execution context is available. */
  }
  // Acknowledge only after durable storage; Cron recovers queue outages.
  return c.json(result);
});
metaPublic.all("/*", (c) =>
  c.json({ message: "Webhook route not found." }, 404),
);

export const metaRoutes = new Hono<AppEnv>();
metaRoutes.use("/management/meta/*", async (c, next) => {
  requireManager(c);
  await next();
});
metaRoutes.get("/management/meta/status", async (c) => {
  const [forms, leads, counts] = await c.env.DB.batch<Record<string, unknown>>([
    c.env.DB.prepare("SELECT * FROM meta_forms ORDER BY page_id,form_id"),
    c.env.DB.prepare(
      "SELECT id,page_id,form_id,mode,status,attempts,last_error,received_at,enquiry_id,mapping_version FROM meta_leads ORDER BY received_at DESC LIMIT 100",
    ),
    c.env.DB.prepare(
      "SELECT status,COUNT(*) AS count FROM meta_leads GROUP BY status",
    ),
  ]);
  return c.json({
    connection: {
      liveEnabled:
        c.env.META_LIVE_INTAKE_ENABLED === "true" && c.env.APP_ENV !== "local",
      credentialsReady: metaCredentialsReady(c.env),
      local: localFixtureAllowed(c.req.url, c.env),
      publicPath: "/webhooks/meta/leads",
    },
    forms: forms.results.map((row) => ({
      ...row,
      data: JSON.parse(String(row.data)),
    })),
    leads: leads.results,
    counts: counts.results,
  });
});
metaRoutes.put("/management/meta/forms", async (c) => {
  const input = metaMappingSchema.parse(await c.req.json()),
    db = c.env.DB,
    id = `${input.pageId}:${input.formId}`,
    version = input.version + 1;
  const valid = await db
    .prepare(
      "SELECT 1 FROM trips WHERE id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND active=1 AND role='staff')",
    )
    .bind(input.tripId, input.ownerId)
    .first();
  if (!valid)
    throw new ApiError(
      400,
      "META_ASSIGNMENT",
      "Choose an existing trip and active staff owner.",
    );
  const data = JSON.stringify({
    ...input,
    version,
    approvedBy: c.get("identity").id,
    approvedAt: new Date().toISOString(),
  });
  // Approval attribution is in audit; the mapping JSON stays strict and versioned.
  const stored = JSON.stringify({ ...input, version });
  const result = await db.batch([
    db
      .prepare(
        "INSERT INTO meta_forms(id,page_id,form_id,version,data) SELECT ?,?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM meta_forms WHERE id=? AND version=?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,data=excluded.data WHERE meta_forms.version=?",
      )
      .bind(
        id,
        input.pageId,
        input.formId,
        version,
        stored,
        input.version,
        id,
        input.version,
        input.version,
      ),
    db
      .prepare(
        "INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) SELECT ?,?,?,'meta.mapping',?,?,? WHERE changes()=1",
      )
      .bind(
        crypto.randomUUID(),
        c.get("identity").id,
        id,
        c.get("requestId"),
        new Date().toISOString(),
        data,
      ),
  ]);
  if (!result[0].meta.changes)
    throw new ApiError(
      409,
      "META_MAPPING_CHANGED",
      "Mapping changed. Reload before saving.",
    );
  return c.json({ id, version });
});
metaRoutes.post("/management/meta/retry", async (c) => {
  const { id, refetch } = z
    .object({ id: metaId, refetch: z.boolean().default(false) })
    .strict()
    .parse(await c.req.json());
  const before = await c.env.DB.prepare(
    "SELECT attempts,payload FROM meta_leads WHERE id=?",
  )
    .bind(id)
    .first();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE meta_leads SET status='pending',attempts=0,next_retry_at=?,payload=CASE WHEN ?=1 THEN NULL ELSE payload END,token=NULL,lease_until=NULL,last_error=NULL WHERE id=? AND status IN ('review','blocked','failed','held')",
    ).bind(new Date().toISOString(), refetch ? 1 : 0, id),
    c.env.DB.prepare(
      "INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) SELECT ?,?,?,'meta.retry',?,?,? WHERE changes()=1",
    ).bind(
      crypto.randomUUID(),
      c.get("identity").id,
      id,
      c.get("requestId"),
      new Date().toISOString(),
      JSON.stringify({
        refetch,
        previousAttempts: before?.attempts,
        ...(refetch ? { previousPayload: before?.payload } : {}),
      }),
    ),
  ]);
  if (!result[0].meta.changes)
    throw new ApiError(
      409,
      "META_NOT_RETRYABLE",
      "Only review, blocked, failed or held leads can be retried.",
    );
  return c.json({ queued: true });
});
metaRoutes.post("/management/meta/sweep", async (c) =>
  c.json(await sweepMeta(c.env)),
);
metaRoutes.get("/management/meta/leads/:id", async (c) => {
  const id = metaId.parse(c.req.param("id"));
  const row = await c.env.DB.prepare("SELECT * FROM meta_leads WHERE id=?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) throw new ApiError(404, "META_LEAD", "Lead not found.");
  return c.json({
    ...row,
    notification: JSON.parse(String(row.notification)),
    payload: row.payload ? JSON.parse(String(row.payload)) : null,
  });
});
metaRoutes.post("/management/meta/backfill", async (c) => {
  if (c.env.APP_ENV === "local")
    throw new ApiError(
      400,
      "META_LOCAL_BACKFILL",
      "Use synthetic fixtures locally.",
    );
  const input = z
    .object({
      pageId: metaId,
      formId: metaId,
      ids: z.array(metaId).min(1).max(25),
    })
    .strict()
    .parse(await c.req.json());
  const result = await acceptMetaEvent(c.env, {
    object: "page",
    entry: [
      {
        id: input.pageId,
        changes: input.ids.map((id) => ({
          field: "leadgen",
          value: {
            leadgen_id: id,
            page_id: input.pageId,
            form_id: input.formId,
            manual_backfill: true,
          },
        })),
      },
    ],
  });
  await c.env.DB.prepare(
    "INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) VALUES(?,?,?,'meta.backfill',?,?,?)",
  )
    .bind(
      crypto.randomUUID(),
      c.get("identity").id,
      input.formId,
      c.get("requestId"),
      new Date().toISOString(),
      JSON.stringify(input),
    )
    .run();
  return c.json(result);
});
metaRoutes.post("/management/meta/fixture", async (c) => {
  if (!localFixtureAllowed(c.req.url, c.env))
    throw new ApiError(404, "NOT_FOUND", "Not found.");
  const { scenario } = z
    .object({ scenario: z.enum(["mapped", "unknown", "retry"]) })
    .strict()
    .parse(await c.req.json());
  const id = `99${Date.now()}${crypto.getRandomValues(new Uint32Array(1))[0]}`,
    form = scenario === "unknown" ? "990000000000099" : syntheticForm;
  const result = await acceptMetaEvent(
    c.env,
    {
      object: "page",
      entry: [
        {
          id: syntheticPage,
          changes: [
            {
              field: "leadgen",
              value: {
                leadgen_id: id,
                page_id: syntheticPage,
                form_id: form,
                synthetic: true,
              },
            },
          ],
        },
      ],
    },
    "synthetic",
    scenario,
  );
  await sweepMeta(c.env);
  return c.json({ id, ...result });
});
metaRoutes.post("/management/meta/reconcile", async (c) => {
  const { pageId, formId, restart } = z
    .object({ pageId: metaId, formId: metaId, restart: z.boolean() })
    .strict()
    .parse(await c.req.json());
  const id = `${pageId}:${formId}`,
    row = await c.env.DB.prepare(
      "SELECT data,cursor FROM meta_forms WHERE id=?",
    )
      .bind(id)
      .first<{ data: string; cursor: string | null }>();
  if (!row) throw new ApiError(404, "META_FORM", "Form mapping not found.");
  const result = await reconcileMetaForm(
    c.env,
    metaMappingSchema.parse(JSON.parse(row.data)),
    restart ? null : row.cursor,
  );
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE meta_forms SET cursor=?,last_scan_at=?,last_scan_count=? WHERE id=? AND cursor IS ?",
    ).bind(
      result.nextCursor,
      new Date().toISOString(),
      result.scanned,
      id,
      row.cursor,
    ),
    c.env.DB.prepare(
      "INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) VALUES(?,?,?,'meta.reconcile',?,?,?)",
    ).bind(
      crypto.randomUUID(),
      c.get("identity").id,
      id,
      c.get("requestId"),
      new Date().toISOString(),
      JSON.stringify(result),
    ),
  ]);
  return c.json(result);
});
