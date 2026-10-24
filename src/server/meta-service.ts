import { z } from "zod";
import type { Bindings } from "./types";
import { ApiError } from "./errors";
import {
  metaId,
  metaLeadSchema,
  metaMappingSchema,
  syntheticLead,
  type MetaMapping,
  type MetaLead,
} from "../shared/meta";
import { ImportService } from "./import-service";
import { checksEnabled, readSettings } from "./settings";
const now = () => new Date().toISOString();
const later = (seconds: number) =>
  new Date(Date.now() + seconds * 1000).toISOString();
export const metaCredentialsReady = (env: Bindings) =>
  !!(
    env.META_APP_SECRET &&
    env.META_VERIFY_TOKEN &&
    env.META_PAGE_ACCESS_TOKEN &&
    /^\d+$/.test(env.META_PAGE_ID || "") &&
    /^v\d+\.0$/.test(env.META_GRAPH_VERSION || "")
  );
export async function verifyMetaSignature(
  body: ArrayBuffer,
  signature: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!/^sha256=[a-fA-F0-9]{64}$/.test(signature || "")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = new Uint8Array(
    signature!
      .slice(7)
      .match(/../g)!
      .map((v) => parseInt(v, 16)),
  );
  return crypto.subtle.verify("HMAC", key, bytes, body);
}
const notificationSchema = z
  .object({
    leadgen_id: metaId,
    page_id: metaId,
    form_id: metaId,
    created_time: z.number().int().nonnegative().optional(),
  })
  .passthrough();
export async function acceptMetaEvent(
  env: Bindings,
  body: unknown,
  mode: "live" | "synthetic" = "live",
  simulation = "",
) {
  const event = z
    .object({
      object: z.string(),
      entry: z
        .array(
          z.object({
            id: metaId,
            changes: z
              .array(z.object({ field: z.string(), value: z.unknown() }))
              .max(100),
          }),
        )
        .max(100),
    })
    .parse(body);
  if (event.object !== "page") return { accepted: 0, ignored: true };
  const leads = event.entry.flatMap((entry) =>
    entry.changes
      .filter((c) => c.field === "leadgen")
      .map((c) => {
        const value = notificationSchema.parse(c.value);
        if (value.page_id !== entry.id)
          throw new ApiError(
            400,
            "META_PAGE_MISMATCH",
            "Notification page IDs disagree.",
          );
        return value;
      }),
  );
  if (leads.length > 100)
    throw new ApiError(
      413,
      "META_EVENT_LIMIT",
      "At most 100 lead changes are accepted per request.",
    );
  if (!leads.length) return { accepted: 0, ignored: true };
  const received = now();
  const result = await env.DB.batch(
    leads.flatMap((lead) => [
      env.DB.prepare(
        "INSERT OR IGNORE INTO meta_leads(id,page_id,form_id,mode,notification,received_at,status,next_retry_at) VALUES(?,?,?,?,?,?,'pending',?)",
      ).bind(
        lead.leadgen_id,
        lead.page_id,
        lead.form_id,
        mode,
        JSON.stringify({ ...lead, ...(simulation ? { simulation } : {}) }),
        received,
        received,
      ),
      env.DB.prepare(
        "UPDATE meta_leads SET last_error='Conflicting notification identity; inspect source evidence',status=CASE WHEN status='completed' THEN status ELSE 'review' END WHERE id=? AND (page_id<>? OR form_id<>? OR mode<>?)",
      ).bind(lead.leadgen_id, lead.page_id, lead.form_id, mode),
    ]),
  );
  return {
    accepted: result
      .filter((_, index) => index % 2 === 0)
      .reduce((sum, r) => sum + r.meta.changes, 0),
    received: leads.length,
  };
}

async function graphJson(
  env: Bindings,
  path: string,
  query: Record<string, string>,
  fetcher: typeof fetch = fetch,
) {
  if (
    !metaCredentialsReady(env) ||
    env.META_LIVE_INTAKE_ENABLED !== "true" ||
    env.APP_ENV === "local"
  )
    throw new ApiError(
      503,
      "META_NOT_READY",
      "Live Meta retrieval is disabled or credentials are missing.",
    );
  const url = new URL(
    `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${path}`,
  );
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, value);
  // Token stays in an Authorization header; redirecting cannot forward it.
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${env.META_PAGE_ACCESS_TOKEN}` },
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new ApiError(
      503,
      "META_RETRIEVAL",
      `Meta retrieval failed (HTTP ${response.status}); check token permissions and retry.`,
    );
  if (Number(response.headers.get("Content-Length") || 0) > 262144)
    throw new ApiError(
      400,
      "META_RESPONSE_SIZE",
      "Meta response exceeded the supported size.",
    );
  const reader = response.body?.getReader();
  if (!reader)
    throw new ApiError(503, "META_EMPTY", "Meta returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 262144) {
      await reader.cancel();
      throw new ApiError(
        400,
        "META_RESPONSE_SIZE",
        "Meta response exceeded the supported size.",
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
type LeadRow = {
  id: string;
  page_id: string;
  form_id: string;
  mode: string;
  status: string;
  attempts: number;
  notification: string;
  payload: string | null;
};
export async function processMetaLead(
  env: Bindings,
  id: string,
  fetcher: typeof fetch = fetch,
) {
  const settings = await readSettings(env.DB);
  if (settings.jobsPaused || settings.recoveryHold) return;
  const token = crypto.randomUUID();
  const claim = await env.DB.prepare(
    `UPDATE meta_leads SET status='processing',token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND status IN ('pending','queued') AND next_retry_at<=? AND attempts<? AND ${checksEnabled}`,
  )
    .bind(token, later(300), id, now(), settings.maxAttempts)
    .run();
  if (!claim.meta.changes) return;
  const row = await env.DB.prepare(
    "SELECT * FROM meta_leads WHERE id=? AND token=?",
  )
    .bind(id, token)
    .first<LeadRow>();
  if (!row) return;
  const finish = async (
    status: string,
    error: string | null,
    enquiryId: string | null = null,
    version: number | null = null,
  ) =>
    env.DB.prepare(
      "UPDATE meta_leads SET status=?,last_error=?,enquiry_id=COALESCE(?,enquiry_id),mapping_version=COALESCE(?,mapping_version),lease_until=NULL,token=NULL WHERE id=? AND token=?",
    )
      .bind(status, error, enquiryId, version, id, token)
      .run();
  try {
    if (
      row.mode === "live" &&
      (env.APP_ENV === "local" ||
        env.META_LIVE_INTAKE_ENABLED !== "true" ||
        !metaCredentialsReady(env) ||
        row.page_id !== env.META_PAGE_ID)
    ) {
      await finish(
        "blocked",
        "Live retrieval is disabled, credentials are missing or page is not configured.",
      );
      return;
    }
    if (row.mode === "synthetic" && env.APP_ENV !== "local") {
      await finish("blocked", "Synthetic fixtures cannot run in production.");
      return;
    }
    const notification = JSON.parse(row.notification);
    if (
      row.mode === "synthetic" &&
      notification.simulation === "retry" &&
      row.attempts === 1
    )
      throw new Error("synthetic retry");
    const lead = metaLeadSchema.parse(
      row.payload
        ? JSON.parse(row.payload)
        : row.mode === "synthetic"
          ? syntheticLead(row.id, row.form_id)
          : await graphJson(
              env,
              row.id,
              {
                fields:
                  "id,created_time,field_data,form_id,ad_id,adset_id,campaign_id,platform,is_organic",
              },
              fetcher,
            ),
    );
    await env.DB.prepare(
      "UPDATE meta_leads SET payload=? WHERE id=? AND token=?",
    )
      .bind(JSON.stringify(lead), id, token)
      .run();
    if (lead.id !== id || lead.form_id !== row.form_id) {
      await finish(
        "review",
        "Retrieved lead identity/form differs from notification; no enquiry created.",
      );
      return;
    }
    const mappingRow = await env.DB.prepare(
      "SELECT version,data FROM meta_forms WHERE page_id=? AND form_id=?",
    )
      .bind(row.page_id, row.form_id)
      .first<{ version: number; data: string }>();
    if (!mappingRow) {
      await finish(
        "review",
        "Unknown form: review and publish a form mapping, then retry.",
      );
      return;
    }
    const mapping = metaMappingSchema.parse(JSON.parse(mappingRow.data));
    if (!mapping.enabled) {
      await finish("review", "Form mapping is disabled; no enquiry created.");
      return;
    }
    const values = new Map<string, string[]>();
    for (const field of lead.field_data) {
      if (values.has(field.name)) {
        await finish("review", "Duplicate field names require source review.");
        return;
      }
      values.set(field.name, field.values);
    }
    const get = (field: string | undefined) =>
      field ? values.get(field)?.[0] || "" : "";
    const name = get(mapping.fields.name).trim();
    if (
      !name ||
      name.length > 100 ||
      (values.get(mapping.fields.name)?.length || 0) !== 1
    ) {
      await finish(
        "review",
        "Missing or ambiguous customer name; no enquiry created.",
      );
      return;
    }
    const document = {
      format: "soulsteps-import-v1",
      sheet: "Meta lead intake",
      mappingVersion: `meta:${row.page_id}:${row.form_id}:v${mappingRow.version}`,
      providerData: { notification, lead, mapping },
      headers: [
        "id",
        "created_time",
        "name",
        "phone",
        "email",
        "group",
        "visa",
        "lead_status",
      ],
      rows: [
        {
          formVersion: mapping.schemaVersion,
          cells: [
            id,
            lead.created_time,
            name,
            get(mapping.fields.phone),
            get(mapping.fields.email),
            ...(mapping.schemaVersion === "v2" ? [""] : []),
            get(mapping.fields.group),
            get(mapping.fields.visa),
            "CREATED",
            ...lead.field_data.map(
              (field) => `${field.name}: ${field.values.join(" / ")}`,
            ),
          ],
          styles: [],
        },
      ],
    };
    const service = new ImportService(
      env,
      { id: "SYSTEM", name: "Meta intake", role: "manager", local: false },
      {
        provider: "Meta lead ad",
        retainSubmittedPhone: true,
        guard: {
          sql: `${checksEnabled} AND EXISTS(SELECT 1 FROM meta_leads WHERE id=? AND token=? AND status='processing')`,
          values: [id, token],
        },
      },
    );
    let batch = await service.upload(JSON.stringify(document)),
      importRow = batch.rows[0];
    if (importRow.status === "review" || importRow.status === "ready") {
      batch = await service.review(batch.id, importRow.id, {
        revision: importRow.revision,
        tripId: mapping.tripId,
        ownerId: mapping.ownerId,
        acknowledged: true,
        verifiedPhone: false,
        reason: `Approved Meta mapping v${mappingRow.version}; preserve submitted fields; no contact verification or consent inferred.`,
      });
      batch = await service.commit(batch.id, [importRow.id]);
      importRow = batch.rows[0];
    }
    if (!importRow.enquiry_id) {
      if (importRow.status === "ready" && importRow.error)
        throw new ApiError(
          503,
          "META_COMMIT_RETRY",
          "Lead write did not complete; retrying without duplicate enquiries.",
        );
      await finish(
        "review",
        importRow.error || "Lead requires import review; no enquiry created.",
      );
      return;
    }
    await finish("completed", null, importRow.enquiry_id, mappingRow.version);
  } catch (error) {
    const terminal = row.attempts >= settings.maxAttempts;
    const message =
      error instanceof ApiError
        ? error.message
        : error instanceof z.ZodError
          ? "Meta response/mapping validation failed; inspect source mapping."
          : "Lead processing failed; retry scheduled. No credentials or customer data are logged.";
    await env.DB.prepare(
      "UPDATE meta_leads SET status=?,last_error=?,next_retry_at=?,lease_until=NULL,token=NULL WHERE id=? AND token=?",
    )
      .bind(
        terminal ? "failed" : "pending",
        message,
        later(Math.min(3600, 30 * 2 ** Math.min(row.attempts, 7))),
        id,
        token,
      )
      .run();
  }
}
export async function sweepMeta(env: Bindings) {
  const settings = await readSettings(env.DB);
  if (settings.jobsPaused || settings.recoveryHold)
    return { paused: true, dispatched: 0 };
  await env.DB.prepare(
    "UPDATE meta_leads SET status=CASE WHEN attempts+CASE WHEN status='queued' THEN 1 ELSE 0 END>=? THEN 'failed' ELSE 'pending' END,attempts=attempts+CASE WHEN status='queued' THEN 1 ELSE 0 END,lease_until=NULL,token=NULL,last_error='Delivery lease expired; inspect attempts and retry safely' WHERE status IN ('queued','processing') AND lease_until<?",
  )
    .bind(settings.maxAttempts, now())
    .run();
  const rows = (
    await env.DB.prepare(
      "SELECT id FROM meta_leads WHERE status='pending' AND next_retry_at<=? AND attempts<? ORDER BY received_at LIMIT 3",
    )
      .bind(now(), settings.maxAttempts)
      .all<{ id: string }>()
  ).results;
  let dispatched = 0;
  for (const row of rows) {
    const token = crypto.randomUUID();
    const claim = await env.DB.prepare(
      `UPDATE meta_leads SET status='queued',token=?,lease_until=? WHERE id=? AND status='pending' AND ${checksEnabled}`,
    )
      .bind(token, later(300), row.id)
      .run();
    if (!claim.meta.changes) continue;
    try {
      await env.JOBS_QUEUE.send({ id: `meta:${row.id}` });
      dispatched++;
    } catch {
      await env.DB.prepare(
        "UPDATE meta_leads SET status=CASE WHEN attempts+1>=? THEN 'failed' ELSE 'pending' END,attempts=attempts+1,last_error='Queue handoff failed; retry scheduled',next_retry_at=?,lease_until=NULL,token=NULL WHERE id=? AND token=? AND status='queued'",
      )
        .bind(settings.maxAttempts, later(60), row.id, token)
        .run();
    }
  }
  return { paused: false, dispatched };
}
export async function reconcileMetaForm(
  env: Bindings,
  mapping: MetaMapping,
  cursor: string | null,
  fetcher: typeof fetch = fetch,
) {
  if (env.APP_ENV === "local")
    throw new ApiError(
      400,
      "META_LOCAL_RECONCILE",
      "Use synthetic fixtures locally; live reconciliation is disabled.",
    );
  if (mapping.pageId !== env.META_PAGE_ID || !mapping.enabled)
    throw new ApiError(
      400,
      "META_FORM_DISABLED",
      "Enable a reviewed mapping for the configured page first.",
    );
  const result = z
    .object({
      data: z.array(z.object({ id: metaId })).max(25),
      paging: z
        .object({
          cursors: z
            .object({ after: z.string().max(2000).optional() })
            .optional(),
          next: z.string().optional(),
        })
        .optional(),
    })
    .parse(
      await graphJson(
        env,
        `${mapping.formId}/leads`,
        { fields: "id", limit: "25", ...(cursor ? { after: cursor } : {}) },
        fetcher,
      ),
    );
  const accepted = await acceptMetaEvent(env, {
    object: "page",
    entry: [
      {
        id: mapping.pageId,
        changes: result.data.map((lead) => ({
          field: "leadgen",
          value: {
            leadgen_id: lead.id,
            page_id: mapping.pageId,
            form_id: mapping.formId,
            reconciled: true,
          },
        })),
      },
    ],
  });
  const next = result.paging?.next ? result.paging.cursors?.after : null;
  if (result.paging?.next && !next)
    throw new ApiError(
      503,
      "META_CURSOR",
      "Meta pagination needs review; no provider URL was followed.",
    );
  return { ...accepted, nextCursor: next || null, scanned: result.data.length };
}
