import { spawnSync } from "node:child_process";
for (const [environment, config] of [
  ["staging", "wrangler.staging.jsonc"],
  ["production", "wrangler.jsonc"],
]) {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "deploy",
      "--dry-run",
      "--config",
      config,
      "--outdir",
      `.wrangler/release/${environment}`,
    ],
    {
      stdio: "inherit",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
