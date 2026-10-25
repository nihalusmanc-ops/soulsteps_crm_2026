import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
// Optional scratch drive for machines with limited space on the workspace drive.
const scratch = resolve(process.env.SOULSTEPS_TEST_STORAGE || ".wrangler");
mkdirSync(scratch, { recursive: true });
const persist = mkdtempSync(resolve(scratch, "e2e-"));
const cli = "node_modules/wrangler/bin/wrangler.js";
const port = process.env.SOULSTEPS_TEST_PORT || "8791";
if (!["8791", "8794"].includes(port))
  throw new Error("Only isolated test ports 8791 or 8794 are supported.");
function run(args) {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "true" },
    });
    let output = "";
    c.stdout.on("data", (d) => (output += d));
    c.stderr.on("data", (d) => (output += d));
    c.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(output)),
    );
  });
}
await run([
  cli,
  "d1",
  "migrations",
  "apply",
  "DB",
  "--local",
  "--config",
  "wrangler.test.jsonc",
  "--persist-to",
  persist,
]);
await run(["--import", "tsx", "scripts/seed.ts", persist]);
const worker = spawn(
  process.execPath,
  [
    cli,
    "dev",
    "--local",
    "--config",
    "wrangler.test.jsonc",
    "--ip",
    "127.0.0.1",
    "--port",
    port,
    "--persist-to",
    persist,
  ],
  { stdio: "inherit" },
);
process.on("SIGTERM", () => {
  worker.kill();
  process.exit();
});
process.on("SIGINT", () => {
  worker.kill();
  process.exit();
});
worker.on("exit", (code) => process.exit(code || 0));
