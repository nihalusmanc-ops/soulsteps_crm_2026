import type { Bindings } from "../server/types";
import { digest } from "../server/request";
export const backupTables = [
  "users",
  "customers",
  "trips",
  "workspace_settings",
  "service_status",
  "storage_review",
  "enquiries",
  "enquiry_sources",
  "tasks",
  "activities",
  "quotations",
  "payments",
  "bookings",
  "files",
  "idempotency_keys",
  "audit_events",
  "trip_content_versions",
  "priority_rule_versions",
  "rule_previews",
  "scheduled_actions",
  "job_attempts",
  "in_app_notifications",
] as const;
export type BackupSnapshot = {
  format: 1;
  createdAt: string;
  tables: Record<string, Record<string, unknown>[]>;
  receipts: {
    id: string;
    originalKey: string;
    backupKey: string;
    checksum: string;
    size: number;
  }[];
  outboundEnabled: false;
};
type Run = {
  status: string;
  object_key: string | null;
  cursor: number;
  receipt_manifest: string;
  created_at: string;
};
// A consistent database snapshot first, then eight receipt copies per queue invocation.
export async function createBackup(
  env: Bindings,
  id: string,
  token: string,
): Promise<boolean> {
  let run = await env.DB.prepare("SELECT * FROM backup_runs WHERE id=?")
    .bind(id)
    .first<Run>();
  if (run?.status === "succeeded") return true;
  const now = new Date().toISOString(),
    prefix = `backups/${encodeURIComponent(id)}`;
  await env.DB.prepare(
    "INSERT INTO backup_runs(id,status,created_at) VALUES(?,'processing',?) ON CONFLICT(id) DO UPDATE SET status='processing',last_error=NULL",
  )
    .bind(id, now)
    .run();
  try {
    if (!run?.object_key) {
      const result = await env.DB.batch<Record<string, unknown>>(
        backupTables.map((table) =>
          env.DB.prepare(`SELECT * FROM ${table} ORDER BY rowid`),
        ),
      );
      const tables = Object.fromEntries(
        backupTables.map((table, i) => [table, result[i].results]),
      );
      const base: BackupSnapshot = {
        format: 1,
        createdAt: now,
        tables,
        receipts: [],
        outboundEnabled: false,
      };
      const text = JSON.stringify(base);
      if (new TextEncoder().encode(text).byteLength > 16 * 1024 * 1024)
        throw new Error("Database snapshot requires a partitioned export.");
      const baseKey = `${prefix}/base-${token}.json`;
      await env.FILES_BUCKET.put(baseKey, text, {
        httpMetadata: { contentType: "application/json" },
      });
      await env.DB.prepare(
        "UPDATE backup_runs SET object_key=?,cursor=0,receipt_manifest='[]',counts=? WHERE id=? AND EXISTS(SELECT 1 FROM scheduled_actions WHERE id=? AND token=? AND status='processing')",
      )
        .bind(
          baseKey,
          JSON.stringify(
            Object.fromEntries(
              backupTables.map((table) => [table, tables[table].length]),
            ),
          ),
          id,
          id,
          token,
        )
        .run();
      // Persist progress before a fresh invocation performs the file-copy work.
      if (tables.files.length) return false;
      run = {
        status: "processing",
        object_key: baseKey,
        cursor: 0,
        receipt_manifest: "[]",
        created_at: now,
      };
    }
    const base = await env.FILES_BUCKET.get(run.object_key!);
    if (!base) throw new Error("Snapshot base is missing.");
    const snapshot = await base.json<BackupSnapshot>();
    const copied: BackupSnapshot["receipts"] = JSON.parse(run.receipt_manifest);
    const files = snapshot.tables.files.slice(run.cursor, run.cursor + 8);
    for (const file of files) {
      const object = await env.FILES_BUCKET.get(String(file.object_key));
      if (!object) throw new Error("Referenced receipt missing.");
      const bytes = await object.arrayBuffer(),
        backupKey = `${prefix}/receipts/${file.id}`;
      await env.FILES_BUCKET.put(backupKey, bytes, {
        httpMetadata: { contentType: "application/octet-stream" },
      });
      copied.push({
        id: String(file.id),
        originalKey: String(file.object_key),
        backupKey,
        checksum: await digest(bytes),
        size: bytes.byteLength,
      });
    }
    const cursor = run.cursor + files.length;
    const progress = await env.DB.prepare(
      "UPDATE backup_runs SET cursor=?,receipt_manifest=? WHERE id=? AND cursor=? AND EXISTS(SELECT 1 FROM scheduled_actions WHERE id=? AND token=? AND status='processing')",
    )
      .bind(cursor, JSON.stringify(copied), id, run.cursor, id, token)
      .run();
    if (progress.meta.changes !== 1) return false;
    if (cursor < snapshot.tables.files.length) return false;
    const payload = JSON.stringify({ ...snapshot, receipts: copied }),
      checksum = await digest(payload),
      objectKey = `${prefix}/database.json`;
    await env.FILES_BUCKET.put(objectKey, payload, {
      httpMetadata: { contentType: "application/json" },
    });
    const completed = await env.DB.prepare(
      "UPDATE backup_runs SET status='succeeded',completed_at=?,object_key=?,checksum=?,last_error=NULL WHERE id=? AND EXISTS(SELECT 1 FROM scheduled_actions WHERE id=? AND token=? AND status='processing')",
    )
      .bind(new Date().toISOString(), objectKey, checksum, id, id, token)
      .run();
    return completed.meta.changes === 1;
  } catch {
    await env.DB.prepare(
      "UPDATE backup_runs SET status='failed',last_error='Snapshot or private receipt copy failed. Review storage and retry.',completed_at=? WHERE id=? AND EXISTS(SELECT 1 FROM scheduled_actions WHERE id=? AND token=?)",
    )
      .bind(new Date().toISOString(), id, id, token)
      .run();
    throw new Error("Private backup failed.");
  }
}
