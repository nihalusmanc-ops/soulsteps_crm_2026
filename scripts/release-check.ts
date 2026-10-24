import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { inspectRelease } from "./release-policy";
const args = process.argv.slice(2),
  templates = args.includes("--templates");
const argument = (key: string) => {
  const index = args.indexOf(key);
  return index >= 0 ? args[index + 1] : undefined;
};
const selected = argument("--environment");
if (!templates && !["staging", "production"].includes(selected || ""))
  throw new Error(
    "Use --environment staging|production, or --templates for structural checks only.",
  );
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const configs = {
  production: JSON.parse(readFileSync("wrangler.jsonc", "utf8")),
  staging: JSON.parse(readFileSync("wrangler.staging.jsonc", "utf8")),
};
let evidence: unknown = null;
const evidencePath = argument("--evidence");
if (evidencePath) {
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch {
    throw new Error(
      "Release evidence cannot be read or is invalid JSON. Contents are not printed.",
    );
  }
}
const results = (
  templates
    ? (["staging", "production"] as const)
    : [selected as "staging" | "production"]
).map((environment) => ({
  environment,
  checks: inspectRelease(
    configs[environment],
    configs[environment === "staging" ? "production" : "staging"],
    environment,
    evidence,
    commit,
    templates,
  ),
}));
if (!templates) {
  const clean = !execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
  for (const result of results)
    result.checks.push({
      id: "working-tree-clean",
      passed: clean,
      message:
        "Release review requires committed source matching the evidence SHA.",
    });
}
const passed = results.every((r) => r.checks.every((c) => c.passed));
const report = {
  mode: templates ? "template-validation" : "release-review",
  checkedAt: new Date().toISOString(),
  commit,
  passed,
  eligibleForHumanReview: !templates && passed,
  deployed: false,
  externalResourcesVerified: false,
  results,
};
mkdirSync(".wrangler/release", { recursive: true });
writeFileSync(
  `.wrangler/release/${templates ? "templates" : selected}-report.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
process.exitCode = passed ? 0 : 1;
