import { reviewStorage } from "../jobs/storage";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types";
import { requireManager } from "./auth";
import { ApiError } from "./errors";
import { Repository } from "./repository";
import { readSettings, checksEnabled } from "./settings";
import {
  defaultRules,
  eligibleForRecompute,
  evaluateRules,
  ruleExamples,
  rulesSchema,
  settingsSchema,
  type RulePreview,
  type WorkspaceSettings,
} from "../shared/management";
import type { Trip } from "../shared/domain";
import { createTripSchema } from "../shared/api";
import { digest, requestKey } from "./request";
import { sweep } from "../jobs/service";
const routes = new Hono<AppEnv>();
const actorRepo = (c: Parameters<typeof requireManager>[0]) =>
  new Repository(c.env.DB, c.get("identity"));
const audit = (
  c: Parameters<typeof requireManager>[0],
  objectId: string,
  action: string,
  data: unknown,
) =>
  c.env.DB.prepare(
    "INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) VALUES(?,?,?,?,?,?,?)",
  ).bind(
    crypto.randomUUID(),
    c.get("identity").id,
    objectId,
    action,
    c.get("requestId"),
    new Date().toISOString(),
    JSON.stringify(data),
  );
routes.get("/settings", async (c) => c.json(await readSettings(c.env.DB)));
routes.get("/notifications", async (c) => {
  const actor = c.get("identity");
  const where =
    actor.role === "manager"
      ? "1=1"
      : "(e.owner_id=? OR json_extract(e.data,'$.shared')=1)";
  const rows = await c.env.DB.prepare(
    `SELECT n.id,n.job_id,n.enquiry_id,n.task_id,n.created_at,n.read_at,c.name,t.data AS task FROM in_app_notifications n JOIN tasks t ON t.id=n.task_id JOIN enquiries e ON e.id=n.enquiry_id JOIN customers c ON c.id=e.customer_id WHERE ${where} AND t.status='pending' AND e.stage NOT IN ('CONFIRMED','LOST','NOT_SUITABLE','ON_HOLD') ORDER BY n.created_at DESC LIMIT 50`,
  )
    .bind(...(actor.role === "manager" ? [] : [actor.id]))
    .all();
  return c.json(rows.results);
});
routes.post("/notifications/:id/read", async (c) => {
  const actor = c.get("identity");
  const result = await c.env.DB.prepare(
    `UPDATE in_app_notifications SET read_at=? WHERE id=? AND enquiry_id IN (SELECT id FROM enquiries WHERE ${actor.role === "manager" ? "1=1" : "(owner_id=? OR json_extract(data,'$.shared')=1)"})`,
  )
    .bind(
      new Date().toISOString(),
      c.req.param("id"),
      ...(actor.role === "manager" ? [] : [actor.id]),
    )
    .run();
  if (!result.meta.changes)
    throw new ApiError(404, "NOT_FOUND", "Reminder not found.");
  return c.json({ ok: true });
});
routes.use("/management/*", async (c, next) => {
  requireManager(c);
  await next();
});
routes.put("/management/settings", async (c) => {
  const input = settingsSchema.parse(await c.req.json());
  const key = requestKey(c.req.header("Idempotency-Key"));
  const hash = await digest(JSON.stringify(input));
  const repo = actorRepo(c);
  const replay = await repo.receipt(key, "settings", hash);
  if (replay) return c.json(replay);
  const before = await readSettings(c.env.DB);
  if (before.version !== input.version)
    throw new ApiError(
      409,
      "REVISION_CONFLICT",
      "Settings changed. Refresh before saving.",
    );
  if (before.recoveryHold !== input.recoveryHold)
    throw new ApiError(
      400,
      "RECOVERY_REVIEW_REQUIRED",
      "Use the explicit recovery review action to release restored checks.",
    );
  const token = crypto.randomUUID();
  const next = { ...input, version: input.version + 1 };
  const response = { version: next.version };
  const now = new Date().toISOString();
  const guard =
    "EXISTS(SELECT 1 FROM workspace_settings WHERE id='workspace' AND write_token=?)";
  try {
    const result = await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE workspace_settings SET version=?,data=?,write_token=? WHERE id='workspace' AND version=?",
      ).bind(next.version, JSON.stringify(next), token, input.version),
      c.env.DB.prepare(
        `INSERT INTO idempotency_keys(key,actor_id,resource,fingerprint,response,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
      ).bind(
        key,
        c.get("identity").id,
        "settings",
        hash,
        JSON.stringify(response),
        now,
        token,
      ),
      c.env.DB.prepare(
        `INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
      ).bind(
        crypto.randomUUID(),
        c.get("identity").id,
        "workspace",
        "settings.update",
        c.get("requestId"),
        now,
        JSON.stringify({ version: next.version, jobsPaused: next.jobsPaused }),
        token,
      ),
    ]);
    if (result[0].meta.changes !== 1)
      throw new ApiError(
        409,
        "REVISION_CONFLICT",
        "Settings changed. Refresh before saving.",
      );
  } catch (error) {
    const replay = await repo.receipt(key, "settings", hash);
    if (replay) return c.json(replay);
    throw error;
  }
  return c.json(response);
});
routes.post("/management/recovery/release", async (c) => {
  const input = z
    .object({
      version: z.number().int(),
      confirmation: z.literal("RESUME IN-APP CHECKS"),
    })
    .strict()
    .parse(await c.req.json());
  const cfg = await readSettings(c.env.DB);
  if (cfg.version !== input.version)
    throw new ApiError(
      409,
      "REVISION_CONFLICT",
      "Settings changed. Refresh first.",
    );
  const now = new Date().toISOString();
  const token = crypto.randomUUID();
  const next: WorkspaceSettings = {
    ...cfg,
    version: cfg.version + 1,
    recoveryHold: false,
    jobsPaused: false,
    outboundEnabled: false,
  };
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE workspace_settings SET version=?,data=?,write_token=? WHERE id='workspace' AND version=?",
    ).bind(next.version, JSON.stringify(next), token, cfg.version),
    c.env.DB.prepare(
      "UPDATE scheduled_actions SET status='pending',lease_until=NULL,token=NULL,next_retry_at=?,updated_at=? WHERE status='held' AND EXISTS(SELECT 1 FROM workspace_settings WHERE write_token=?)",
    ).bind(now, now, token),
    c.env.DB.prepare(
      "INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM workspace_settings WHERE write_token=?)",
    ).bind(
      crypto.randomUUID(),
      c.get("identity").id,
      "workspace",
      "recovery.reviewed",
      c.get("requestId"),
      now,
      '{"outboundEnabled":false}',
      token,
    ),
  ]);
  if (result[0].meta.changes !== 1)
    throw new ApiError(
      409,
      "REVISION_CONFLICT",
      "Settings changed. Refresh first.",
    );
  return c.json({ ok: true, outboundEnabled: false });
});
routes.get("/management/jobs", async (c) => {
  const jobs = await c.env.DB.prepare(
    "SELECT * FROM scheduled_actions ORDER BY updated_at DESC LIMIT 100",
  ).all();
  const counts = await c.env.DB.prepare(
    "SELECT status,COUNT(*) AS count FROM scheduled_actions GROUP BY status",
  ).all();
  const backups = await c.env.DB.prepare(
    "SELECT id,status,created_at,completed_at,checksum,counts,last_error FROM backup_runs ORDER BY created_at DESC LIMIT 30",
  ).all();
  const attempts = await c.env.DB.prepare(
    "SELECT * FROM job_attempts ORDER BY at DESC LIMIT 100",
  ).all();
  const health = await c.env.DB.prepare(
    "SELECT * FROM service_status WHERE id='due_checks'",
  ).first();
  return c.json({
    health,
    storage: await c.env.DB.prepare(
      "SELECT data FROM storage_review WHERE id='receipts'",
    ).first<{ data: string }>(),
    jobs: jobs.results,
    counts: counts.results,
    backups: backups.results,
    attempts: attempts.results,
  });
});
routes.post("/management/storage/review", async (c) => {
  await audit(c, "storage", "storage.review", {}).run();
  return c.json(await reviewStorage(c.env));
});
routes.post("/management/jobs/sweep", async (c) => {
  await audit(c, "jobs", "jobs.sweep.requested", {}).run();
  return c.json(await sweep(c.env));
});
routes.post("/management/jobs/:id/retry", async (c) => {
  const now = new Date().toISOString();
  const id = c.req.param("id");
  const token = crypto.randomUUID();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE scheduled_actions SET status='pending',attempts=0,dispatch_attempts=0,token=?,next_retry_at=?,lease_until=NULL,last_error=NULL,updated_at=? WHERE id=? AND status='failed' AND ${checksEnabled}`,
    ).bind(token, now, now, id),
    c.env.DB.prepare(
      "INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM scheduled_actions WHERE id=? AND token=?)",
    ).bind(
      crypto.randomUUID(),
      c.get("identity").id,
      id,
      "jobs.retry",
      c.get("requestId"),
      now,
      "{}",
      id,
      token,
    ),
  ]);
  if (result[0].meta.changes !== 1)
    throw new ApiError(
      409,
      "NOT_RETRYABLE",
      "Only failed checks can be retried while checks are enabled.",
    );
  return c.json({ ok: true });
});
routes.get("/management/audit", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT a.*,u.display_name AS actor FROM audit_events a JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 100",
  ).all();
  return c.json(rows.results);
});
routes.get("/management/trips/:id/rules", async (c) => {
  const trip = (await actorRepo(c).state()).trips.find(
    (t) => t.id === c.req.param("id"),
  );
  if (!trip) throw new ApiError(404, "NOT_FOUND", "Trip not found.");
  const history = await c.env.DB.prepare(
    "SELECT id,version,reviewed_by,reviewed_at FROM priority_rule_versions WHERE trip_id=? ORDER BY version DESC",
  )
    .bind(trip.id)
    .all();
  return c.json({
    rules: trip.activeRules || defaultRules,
    activeVersion: trip.activeRuleVersion || null,
    tripVersion: trip.version,
    history: history.results,
  });
});
routes.post("/management/trips/:id/rules/preview", async (c) => {
  const { rules } = z
    .object({ rules: rulesSchema })
    .strict()
    .parse(await c.req.json());
  const state = await actorRepo(c).state();
  const trip = state.trips.find((t) => t.id === c.req.param("id"));
  if (!trip) throw new ApiError(404, "NOT_FOUND", "Trip not found.");
  const enquiries = state.enquiries
    .filter((e) => e.tripId === trip.id)
    .sort((a, b) => a.id.localeCompare(b.id, "en", { sensitivity: "variant" }));
  const snapshot = JSON.stringify(
    enquiries
      .map((e) => [e.id, e.revision])
      .sort((a, b) =>
        String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0,
      ),
  );
  const preview: RulePreview = {
    id: crypto.randomUUID(),
    tripId: trip.id,
    tripVersion: trip.version,
    rules,
    examples: ruleExamples(rules),
    expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
    rows: enquiries.map((e) => {
      const fit = evaluateRules(rules, e.group, e.visa);
      const preserved = !eligibleForRecompute(e);
      return {
        id: e.id,
        name: e.name,
        revision: e.revision,
        before: e.rank,
        after: preserved ? e.rank : fit.rank,
        reason: preserved
          ? e.override
            ? "Manual override preserved"
            : "Closed / confirmed history preserved"
          : fit.reason,
        preserved,
      };
    }),
  };
  await c.env.DB.prepare(
    "INSERT INTO rule_previews(id,trip_id,actor_id,trip_version,snapshot,data,expires_at) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(
      preview.id,
      trip.id,
      c.get("identity").id,
      trip.version,
      snapshot,
      JSON.stringify(preview),
      preview.expiresAt,
    )
    .run();
  return c.json(preview);
});
routes.post("/management/trips/:id/rules/publish", async (c) => {
  const input = z
    .object({ previewId: z.string(), reviewed: z.literal(true) })
    .strict()
    .parse(await c.req.json());
  const tripId = c.req.param("id");
  const key = requestKey(c.req.header("Idempotency-Key"));
  const hash = await digest(JSON.stringify(input));
  const repo = actorRepo(c);
  const replay = await repo.receipt(key, `rules:${tripId}`, hash);
  if (replay) return c.json(replay);
  const record = await c.env.DB.prepare(
    "SELECT * FROM rule_previews WHERE id=? AND trip_id=? AND actor_id=?",
  )
    .bind(input.previewId, tripId, c.get("identity").id)
    .first<{ data: string; snapshot: string; expires_at: string }>();
  if (!record || record.expires_at < new Date().toISOString())
    throw new ApiError(
      409,
      "PREVIEW_EXPIRED",
      "Preview again before publishing.",
    );
  const preview = JSON.parse(record.data) as RulePreview;
  const trip = (await repo.state()).trips.find((t) => t.id === tripId)!;
  const now = new Date().toISOString();
  const version = (trip.activeRuleVersion || 0) + 1;
  const token = crypto.randomUUID();
  const next: Trip = {
    ...trip,
    version: trip.version + 1,
    activeRuleVersion: version,
    activeRules: preview.rules,
    groupVisaPolicy: "review",
  };
  const stored = { ...next, writeToken: token };
  const guard =
    "EXISTS(SELECT 1 FROM trips WHERE id=? AND json_extract(data,'$.writeToken')=?)";
  const writes = [
    c.env.DB.prepare(
      "UPDATE trips SET version=?,data=? WHERE id=? AND version=? AND (SELECT json_group_array(json_array(id,revision)) FROM (SELECT id,revision FROM enquiries WHERE trip_id=? AND json_extract(data,'$.deletedAt') IS NULL ORDER BY id))=?",
    ).bind(
      next.version,
      JSON.stringify(stored),
      tripId,
      preview.tripVersion,
      tripId,
      record.snapshot,
    ),
    c.env.DB.prepare(
      `INSERT INTO priority_rule_versions(id,trip_id,version,rules,reviewed_by,reviewed_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
    ).bind(
      crypto.randomUUID(),
      tripId,
      version,
      JSON.stringify(preview.rules),
      c.get("identity").id,
      now,
      tripId,
      token,
    ),
  ];
  const changed = preview.rows
    .filter((r) => !r.preserved)
    .map((row) => ({
      ...row,
      activity: {
        id: crypto.randomUUID(),
        type: "qualification",
        text:
          "Trip fit reviewed under rule version " +
          version +
          ": " +
          (row.before || "Needs qualification") +
          " -> " +
          (row.after || "Needs qualification") +
          ".",
        at: now,
        actor: c.get("identity").name,
      },
    }));
  const changes = JSON.stringify(changed);
  writes.push(
    c.env.DB.prepare(
      "UPDATE enquiries SET revision=enquiries.revision+1,updated_at=?,write_token=?,data=json_set(enquiries.data,'$.rank',json_extract(r.value,'$.after'),'$.rankReason',?||json_extract(r.value,'$.reason'),'$.rankRuleVersion',?,'$.rankComputedAt',?) FROM json_each(?) r WHERE enquiries.id=json_extract(r.value,'$.id') AND enquiries.revision=json_extract(r.value,'$.revision') AND " +
        guard,
    ).bind(
      now,
      token,
      "Reviewed v" + version + ": ",
      version,
      now,
      changes,
      tripId,
      token,
    ),
  );
  writes.push(
    c.env.DB.prepare(
      "INSERT INTO activities(id,enquiry_id,actor_id,occurred_at,data) SELECT json_extract(value,'$.activity.id'),json_extract(value,'$.id'),?,?,json_extract(value,'$.activity') FROM json_each(?) WHERE " +
        guard,
    ).bind(c.get("identity").id, now, changes, tripId, token),
  );
  const response = {
    version,
    updated: preview.rows.filter((r) => !r.preserved).length,
    preserved: preview.rows.filter((r) => r.preserved).length,
  };
  writes.push(
    c.env.DB.prepare(
      `INSERT INTO idempotency_keys(key,actor_id,resource,fingerprint,response,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
    ).bind(
      key,
      c.get("identity").id,
      `rules:${tripId}`,
      hash,
      JSON.stringify(response),
      now,
      tripId,
      token,
    ),
    c.env.DB.prepare(
      `INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,
    ).bind(
      crypto.randomUUID(),
      c.get("identity").id,
      tripId,
      "rules.publish",
      c.get("requestId"),
      now,
      JSON.stringify(response),
      tripId,
      token,
    ),
  );
  try {
    const results = await c.env.DB.batch(writes);
    if (results[0].meta.changes !== 1)
      throw new ApiError(
        409,
        "PREVIEW_STALE",
        "Trip or enquiry data changed. Preview again before publishing.",
      );
  } catch (error) {
    const replay = await repo.receipt(key, `rules:${tripId}`, hash);
    if (replay) return c.json(replay);
    throw error;
  }
  return c.json(response);
});
routes.post("/management/backups", async (c) => {
  const key = requestKey(c.req.header("Idempotency-Key"));
  const id = `backup:manual:${c.get("identity").id}:${key}`;
  const now = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT OR IGNORE INTO scheduled_actions(id,kind,due_at,status,next_retry_at,created_at,updated_at) VALUES(?,'backup',?,'pending',?,?,?)",
    ).bind(id, now, now, now, now),
    audit(c, id, "backup.requested", {}),
  ]);
  await sweep(c.env, { includeDailyBackup: false });
  return c.json({ id }, 202);
});
routes.get("/management/backups/:id", async (c) => {
  const run = await c.env.DB.prepare(
    "SELECT object_key,checksum FROM backup_runs WHERE id=? AND status='succeeded'",
  )
    .bind(c.req.param("id"))
    .first<{ object_key: string; checksum: string }>();
  if (!run) throw new ApiError(404, "NOT_FOUND", "Completed backup not found.");
  const object = await c.env.FILES_BUCKET.get(run.object_key);
  if (!object)
    throw new ApiError(404, "NOT_FOUND", "Backup file is unavailable.");
  c.header("Content-Type", "application/json");
  c.header("X-Backup-SHA256", run.checksum);
  c.header(
    "Content-Disposition",
    'attachment; filename="soulsteps-backup.json"',
  );
  return c.body(object.body);
});
routes.get("/management/backups/:id/receipts/:fileId", async (c) => {
  const run = await c.env.DB.prepare(
    "SELECT object_key FROM backup_runs WHERE id=? AND status='succeeded'",
  )
    .bind(c.req.param("id"))
    .first<{ object_key: string }>();
  if (!run) throw new ApiError(404, "NOT_FOUND", "Backup not found.");
  const object = await c.env.FILES_BUCKET.get(run.object_key);
  if (!object) throw new ApiError(404, "NOT_FOUND", "Backup file unavailable.");
  const snapshot = await object.json<{
    receipts: { id: string; backupKey: string; checksum: string }[];
  }>();
  const file = snapshot.receipts.find((f) => f.id === c.req.param("fileId"));
  if (!file) throw new ApiError(404, "NOT_FOUND", "Backup receipt not found.");
  const receipt = await c.env.FILES_BUCKET.get(file.backupKey);
  if (!receipt)
    throw new ApiError(404, "NOT_FOUND", "Backup receipt unavailable.");
  c.header("Content-Type", "application/octet-stream");
  c.header("X-Backup-SHA256", file.checksum);
  return c.body(receipt.body);
});
routes.post("/management/trips", async (c) => {
  const input = createTripSchema.parse(await c.req.json());
  const key = requestKey(c.req.header("Idempotency-Key")),
    hash = await digest(JSON.stringify(input)),
    repo = actorRepo(c),
    resource = "trip.create";
  const replay = await repo.receipt(key, resource, hash);
  if (replay) return c.json(replay);
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  const trip: Trip = {
    ...input,
    id,
    status: "draft",
    version: 1,
    groupVisaPolicy: "review",
  };
  const response = { id };
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO trips(id,name,version,data) VALUES(?,?,1,?)",
      ).bind(id, trip.name, JSON.stringify(trip)),
      audit(c, id, "trip.create", { version: 1 }),
      c.env.DB.prepare(
        "INSERT INTO idempotency_keys(key,actor_id,resource,fingerprint,response,created_at) VALUES(?,?,?,?,?,?)",
      ).bind(
        key,
        c.get("identity").id,
        resource,
        hash,
        JSON.stringify(response),
        now,
      ),
    ]);
  } catch (error) {
    const replay = await repo.receipt(key, resource, hash);
    if (replay) return c.json(replay);
    throw error;
  }
  return c.json(response, 201);
});
routes.post("/management/trips/:id/publish", async (c) => {
  const { version, manualOnly } = z
    .object({
      version: z.number().int().positive(),
      manualOnly: z.literal(true),
    })
    .strict()
    .parse(await c.req.json());
  const repo = actorRepo(c),
    id = c.req.param("id"),
    key = requestKey(c.req.header("Idempotency-Key")),
    hash = await digest(JSON.stringify({ version, manualOnly }));
  const replay = await repo.receipt(key, "content:" + id, hash);
  if (replay) return c.json(replay);
  const trip = (await repo.state()).trips.find((t) => t.id === id);
  if (!trip) throw new ApiError(404, "NOT_FOUND", "Trip not found.");
  if (!trip.name.trim() || !trip.destination.trim() || !trip.description.trim())
    throw new ApiError(
      400,
      "MISSING_CONTENT",
      "Name, destination and description are required for manual CRM publication.",
    );
  const nextVersion = (trip.activeContentVersion || 0) + 1,
    now = new Date().toISOString(),
    token = crypto.randomUUID();
  const next = {
    ...trip,
    status: "published",
    version: version + 1,
    activeContentVersion: nextVersion,
    publishedAt: now,
    writeToken: token,
  };
  const response = {
    version: next.version,
    contentVersion: nextVersion,
    automatedItinerary: false,
    automatedPrices: false,
  };
  const guard =
    "EXISTS(SELECT 1 FROM trips WHERE id=? AND json_extract(data,'$.writeToken')=?)";
  try {
    const result = await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE trips SET version=?,data=? WHERE id=? AND version=?",
      ).bind(next.version, JSON.stringify(next), id, version),
      c.env.DB.prepare(
        "INSERT INTO trip_content_versions(id,trip_id,version,content,published_by,published_at) SELECT ?,?,?,?,?,? WHERE " +
          guard,
      ).bind(
        crypto.randomUUID(),
        id,
        nextVersion,
        JSON.stringify({
          ...trip,
          manualOnly: true,
          automatedItinerary: false,
          automatedPrices: false,
        }),
        c.get("identity").id,
        now,
        id,
        token,
      ),
      c.env.DB.prepare(
        "INSERT INTO idempotency_keys(key,actor_id,resource,fingerprint,response,created_at) SELECT ?,?,?,?,?,? WHERE " +
          guard,
      ).bind(
        key,
        c.get("identity").id,
        "content:" + id,
        hash,
        JSON.stringify(response),
        now,
        id,
        token,
      ),
      c.env.DB.prepare(
        "INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) SELECT ?,?,?,?,?,?,? WHERE " +
          guard,
      ).bind(
        crypto.randomUUID(),
        c.get("identity").id,
        id,
        "trip.publish",
        c.get("requestId"),
        now,
        JSON.stringify(response),
        id,
        token,
      ),
    ]);
    if (result[0].meta.changes !== 1)
      throw new ApiError(
        409,
        "REVISION_CONFLICT",
        "Trip changed. Review the current version before publishing.",
      );
  } catch (error) {
    const replay = await repo.receipt(key, "content:" + id, hash);
    if (replay) return c.json(replay);
    throw error;
  }
  return c.json(response);
});
export { routes as managementRoutes };
