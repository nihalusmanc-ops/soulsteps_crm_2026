import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { backupTables, type BackupSnapshot } from "../src/jobs/backup";
const sourceArg = process.argv.indexOf("--source");
const source = new URL(
  sourceArg >= 0 ? process.argv[sourceArg + 1] : "http://127.0.0.1:8787",
);
if (
  !["127.0.0.1", "localhost"].includes(source.hostname) ||
  source.protocol !== "http:"
)
  throw new Error(
    "Restore check accepts only the local fictional CRM runtime.",
  );
const headers = { Origin: source.origin, "X-Soulsteps-Request": "1" };
async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(new URL("/api" + path, source), {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (!response.ok)
    throw new Error(`Source request failed: ${response.status}`);
  return response;
}
const requested = (await (
  await api("/management/backups", {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
  })
).json()) as { id: string };
let ready = false;
for (let i = 0; i < 120; i++) {
  const list = (await (await api("/management/jobs")).json()) as {
    backups: { id: string; status: string }[];
    jobs: { id: string; status: string }[];
  };
  const row = list.backups.find((b) => b.id === requested.id);
  if (row?.status === "succeeded") {
    ready = true;
    break;
  }
  if (list.jobs.find((j) => j.id === requested.id)?.status === "failed")
    throw new Error("Source backup failed. Inspect manager health.");
  await new Promise((r) => setTimeout(r, 250));
}
if (!ready) throw new Error("Backup not ready; check whether jobs are paused.");
const response = await api(
  "/management/backups/" + encodeURIComponent(requested.id),
);
const payload = await response.text();
const hash = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
if (hash(payload) !== response.headers.get("X-Backup-SHA256"))
  throw new Error("Backup checksum mismatch.");
const snapshot = JSON.parse(payload) as BackupSnapshot;
if (
  snapshot.format !== 1 ||
  snapshot.outboundEnabled !== false ||
  Object.keys(snapshot.tables).some(
    (t) => !backupTables.includes(t as (typeof backupTables)[number]),
  )
)
  throw new Error("Unsupported backup manifest.");
for (const file of snapshot.receipts) {
  if (
    !/^[a-zA-Z0-9_-]{1,100}$/.test(file.id) ||
    !file.originalKey.startsWith("receipts/") ||
    !snapshot.tables.files.some(
      (row) => row.id === file.id && row.object_key === file.originalKey,
    )
  )
    throw new Error("Invalid backup receipt association.");
}
if (backupTables.some((table) => !Array.isArray(snapshot.tables[table])))
  throw new Error("Backup is missing required tables.");
mkdirSync(".wrangler", { recursive: true });
const directory = mkdtempSync(resolve(".wrangler/restore-drill-"));
const persist = join(directory, "state");
writeFileSync(join(directory, "snapshot.json"), payload);
const cli = "node_modules/wrangler/bin/wrangler.js";
function run(args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || "Local CLI failed.");
  return result.stdout;
}
const dbArgs = [
  "DB",
  "--local",
  "--config",
  "wrangler.local.jsonc",
  "--persist-to",
  persist,
];
run(["d1", "migrations", "apply", ...dbArgs]);
const identifier = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name))
    throw new Error("Invalid snapshot column.");
  return `"${name}"`;
};
const value = (v: unknown) =>
  v === null
    ? "NULL"
    : typeof v === "number" && Number.isFinite(v)
      ? String(v)
      : typeof v === "string"
        ? `'${v.replaceAll("'", "''")}'`
        : (() => {
            throw new Error("Invalid snapshot value.");
          })();
const statements: string[] = [];
for (const table of backupTables) {
  for (const original of snapshot.tables[table] || []) {
    const row = { ...original };
    if (table === "workspace_settings") {
      const cfg = JSON.parse(String(row.data));
      row.data = JSON.stringify({
        ...cfg,
        jobsPaused: true,
        recoveryHold: true,
        outboundEnabled: false,
      });
      row.write_token = null;
    }
    if (
      table === "scheduled_actions" &&
      ["pending", "queued", "processing", "failed"].includes(String(row.status))
    ) {
      row.status = "held";
      row.token = null;
      row.lease_until = null;
    }
    if (table === "enquiries") row.write_token = null;
    const columns = Object.keys(row);
    const conflict =
      table === "users"
        ? " ON CONFLICT(id) DO NOTHING"
        : table === "workspace_settings"
          ? ` ON CONFLICT(id) DO UPDATE SET version=excluded.version,data=excluded.data,write_token=NULL`
          : "";
    statements.push(
      `INSERT INTO ${identifier(table)}(${columns.map(identifier).join(",")}) VALUES(${columns.map((c) => value(row[c])).join(",")})${conflict};`,
    );
  }
}
const sql = join(directory, "restore.sql");
writeFileSync(sql, statements.join("\n"));
run(["d1", "execute", ...dbArgs, "--file", sql]);
const verify = run([
  "d1",
  "execute",
  ...dbArgs,
  "--command",
  backupTables
    .map(
      (t) =>
        `SELECT '${t}' AS table_name,COUNT(*) AS row_count FROM ${identifier(t)}`,
    )
    .join(";"),
  "--json",
]);
const verified = JSON.parse(verify) as {
  results: { table_name: string; row_count: number }[];
}[];
const verifiedCounts = verified.flatMap((result) => result.results);
for (const row of verifiedCounts) {
  if (row.row_count !== snapshot.tables[row.table_name].length)
    throw new Error(`Restored count mismatch: ${row.table_name}`);
}
// Copy private receipt bytes into the isolated target R2, preserving only original object keys.
for (const file of snapshot.receipts) {
  const result = await api(
    `/management/backups/${encodeURIComponent(requested.id)}/receipts/${file.id}`,
  );
  const bytes = new Uint8Array(await result.arrayBuffer());
  if (hash(bytes) !== file.checksum || bytes.byteLength !== file.size)
    throw new Error("Receipt checksum mismatch.");
  const path = join(directory, `${file.id}.bin`);
  writeFileSync(path, bytes);
  run([
    "r2",
    "object",
    "put",
    `soulsteps-private-receipts/${file.originalKey}`,
    "--local",
    "--config",
    "wrangler.local.jsonc",
    "--persist-to",
    persist,
    "--file",
    path,
  ]);
}
const restoreConfig = JSON.parse(readFileSync("wrangler.local.jsonc", "utf8"));
const suffix = crypto.randomUUID().slice(0, 8);
restoreConfig.name = "soulsteps-restore-" + suffix;
restoreConfig.main = resolve("src/server/index.ts");
restoreConfig.assets.directory = resolve("dist");
restoreConfig.d1_databases[0].migrations_dir = resolve("drizzle/migrations");
restoreConfig.queues.producers[0].queue = "restore-jobs-" + suffix;
restoreConfig.queues.consumers[0].queue = "restore-jobs-" + suffix;
restoreConfig.queues.consumers[0].dead_letter_queue = "restore-dead-" + suffix;
const configPath = join(directory, "wrangler.restore.json");
writeFileSync(configPath, JSON.stringify(restoreConfig));
const worker = spawn(
  process.execPath,
  [
    cli,
    "dev",
    "--local",
    "--config",
    configPath,
    "--ip",
    "127.0.0.1",
    "--port",
    "8793",
    "--persist-to",
    persist,
  ],
  { stdio: "ignore" },
);
try {
  let up = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch("http://127.0.0.1:8793/api/health");
      if (r.ok) {
        up = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!up) throw new Error("Isolated restore runtime did not start.");
  const cfg = (await (
    await fetch("http://127.0.0.1:8793/api/settings")
  ).json()) as {
    jobsPaused: boolean;
    recoveryHold: boolean;
    outboundEnabled: boolean;
  };
  if (!cfg.jobsPaused || !cfg.recoveryHold || cfg.outboundEnabled)
    throw new Error("Restore safety hold is missing.");
  const check = (await (
    await fetch("http://127.0.0.1:8793/api/management/jobs/sweep", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:8793", "X-Soulsteps-Request": "1" },
    })
  ).json()) as { paused: boolean; dispatched: number };
  if (!check.paused || check.dispatched !== 0)
    throw new Error("Restored jobs were not held.");
  for (const file of snapshot.receipts) {
    const result = await fetch(`http://127.0.0.1:8793/api/files/${file.id}`);
    if (
      !result.ok ||
      hash(new Uint8Array(await result.arrayBuffer())) !== file.checksum
    )
      throw new Error("Restored receipt download mismatch.");
  }
  const report = {
    status: "passed",
    sourceBackup: requested.id,
    createdAt: new Date().toISOString(),
    tables: verifiedCounts,
    receiptCopies: snapshot.receipts.length,
    checksHeld: true,
    outboundEnabled: false,
    destination: directory,
  };
  writeFileSync(
    join(directory, "restore-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (process.platform === "win32")
    spawnSync("taskkill", ["/PID", String(worker.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  else worker.kill();
}
