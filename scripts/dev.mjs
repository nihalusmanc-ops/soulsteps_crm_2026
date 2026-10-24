import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
const cli = "node_modules/wrangler/bin/wrangler.js";
function run(args) {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, args, {
      stdio: "inherit",
      env: { ...process.env, CI: "true" },
    });
    c.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Command failed (${code})`)),
    );
  });
}
if (!existsSync("dist/index.html"))
  await run(["node_modules/vite/bin/vite.js", "build"]);
await run([
  cli,
  "d1",
  "migrations",
  "apply",
  "DB",
  "--local",
  "--config",
  "wrangler.local.jsonc",
]);
await run(["--import", "tsx", "scripts/seed.ts"]);
const worker = spawn(
  process.execPath,
  [
    cli,
    "dev",
    "--local",
    "--config",
    "wrangler.local.jsonc",
    "--ip",
    "127.0.0.1",
    "--port",
    "8787",
    "--test-scheduled",
  ],
  { stdio: "inherit" },
);
const web = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--strictPort"],
  { stdio: "inherit" },
);
let tickBusy = false;
async function tick() {
  if (tickBusy) return;
  tickBusy = true;
  try {
    await fetch("http://127.0.0.1:8787/cdn-cgi/local/scheduled", {
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    /* Worker may still be starting; next tick retries. */
  } finally {
    tickBusy = false;
  }
}
const clock = setInterval(tick, 60000);
const firstTick = setTimeout(tick, 5000);
function stop() {
  clearInterval(clock);
  clearTimeout(firstTick);
  worker.kill();
  web.kill();
}
process.on("SIGINT", () => {
  stop();
  process.exit();
});
process.on("SIGTERM", () => {
  stop();
  process.exit();
});
worker.on("exit", (code) => {
  web.kill();
  process.exit(code || 0);
});
web.on("exit", (code) => {
  worker.kill();
  process.exit(code || 0);
});
