import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
for (const port of [8794, 8793])
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Restore port ${port} is occupied; no existing process will be stopped.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
mkdirSync(".wrangler/release", { recursive: true });
const worker = spawn(process.execPath, ["scripts/test-server.mjs"], {
  env: {
    ...process.env,
    SOULSTEPS_TEST_PORT: "8794",
    WRANGLER_SEND_METRICS: "false",
  },
  windowsHide: true,
  detached: process.platform !== "win32",
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
for (const stream of [worker.stdout, worker.stderr])
  stream.on("data", (chunk) => {
    log = (log + chunk).slice(-100000);
  });
const origin = "http://127.0.0.1:8794",
  headers = { Origin: origin, "X-Soulsteps-Request": "1" };
async function post(path, body) {
  const response = await fetch(origin + "/api" + path, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`Isolated fixture setup failed (${response.status}).`);
  return response.json();
}
try {
  let up = false;
  for (let i = 0; i < 300; i++) {
    if (worker.exitCode !== null)
      throw new Error("Isolated fixture Worker exited.");
    try {
      if ((await fetch(origin + "/api/health")).ok) {
        up = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!up) throw new Error("Isolated fixture Worker did not start.");
  await post("/auth/password", {
    password: "Fictional restore passphrase 2026!",
  });
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Ff8AAAAASUVORK5CYII=",
    "base64",
  );
  for (let i = 1; i <= 2; i++) {
    const form = new FormData();
    form.set(
      "file",
      new File([bytes], `synthetic-storage-fixture-${i}.png`, {
        type: "image/png",
      }),
    );
    const response = await fetch(origin + "/api/enquiries/DEMO-05/files", {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      body: form,
    });
    if (!response.ok) throw new Error("Synthetic attachment setup failed.");
  }
  await post(
    "/management/imports/batches",
    JSON.parse(readFileSync("public/samples/import-preview.json", "utf8")),
  );
  const fixture = await post("/management/meta/fixture", {
    scenario: "unknown",
  });
  for (let i = 0; i < 100; i++) {
    const state = await (
      await fetch(origin + `/api/management/meta/leads/${fixture.id}`)
    ).json();
    if (state.status === "review") break;
    if (i === 99) throw new Error("Synthetic Meta review did not complete.");
    await new Promise((r) => setTimeout(r, 100));
  }
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/restore-check.ts", "--source", origin],
    { stdio: ["ignore", "pipe", "inherit"], windowsHide: true },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  const code = await new Promise((resolve) => child.on("exit", resolve));
  if (code !== 0) throw new Error("Isolated restore verification failed.");
  const report = JSON.parse(output);
  delete report.destination;
  if (
    report.receiptCopies !== 2 ||
    !report.tables.some(
      (table) =>
        table.table_name === "auth_credentials" && table.row_count === 1,
    ) ||
    report.importSources < 1 ||
    report.metaSources < 1 ||
    !report.checksHeld ||
    report.outboundEnabled
  )
    throw new Error("Restore fixture coverage is incomplete.");
  writeFileSync(
    ".wrangler/release/restore-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  writeFileSync(".wrangler/release/restore-source.log", log);
  if (process.platform === "win32")
    spawnSync("taskkill", ["/PID", String(worker.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  else {
    try {
      process.kill(-worker.pid, "SIGTERM");
    } catch {}
  }
}
