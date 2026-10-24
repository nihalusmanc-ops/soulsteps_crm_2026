import { z } from "zod";
export const releaseGates = [
  "accessAndInvites",
  "privateStorageAndDomains",
  "staffWorkflow",
  "restoreDrill",
  "monitoringAndBudget",
  "retentionAndRecovery",
  "rollbackPlan",
  "stagingSyntheticData",
  "productionContentAndTerms",
  "rankingPolicy",
  "migrationCutover",
  "metaAcceptance",
] as const;
const approval = z
  .object({
    status: z.enum(["pending", "approved", "deferred"]),
    reviewedBy: z.string().min(1).nullable(),
    reviewedAt: z.iso.datetime().nullable(),
    evidence: z.string().min(8).nullable(),
  })
  .strict();
export const releaseEvidenceSchema = z
  .object({
    environment: z.enum(["staging", "production"]),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    gates: z.record(z.enum(releaseGates), approval),
  })
  .strict();
type Config = Record<string, any>;
export type ReleaseCheck = { id: string; passed: boolean; message: string };
export function inspectRelease(
  config: Config,
  other: Config,
  environment: "staging" | "production",
  evidence: unknown,
  commit: string,
  templates = false,
): ReleaseCheck[] {
  const checks: ReleaseCheck[] = [];
  const add = (id: string, passed: boolean, message: string) =>
    checks.push({ id, passed, message });
  add(
    "identity-mode",
    config.define?.__LOCAL_DEV__ === "false" &&
      config.vars?.APP_ENV === environment,
    "Nonlocal build and correct environment required.",
  );
  add(
    "alternate-domains",
    config.workers_dev === false && config.preview_urls === false,
    "workers.dev and version preview URLs must be disabled.",
  );
  add(
    "routing",
    ["/api/*", "/webhooks/*"].every((p) =>
      config.assets?.run_worker_first?.includes(p),
    ),
    "API and webhook paths must reach the Worker before assets.",
  );
  add(
    "separate-workers",
    !!config.name && config.name !== other.name,
    "Staging and production Worker names must differ.",
  );
  for (const [id, a, b] of [
    [
      "database",
      config.d1_databases?.[0]?.database_name,
      other.d1_databases?.[0]?.database_name,
    ],
    [
      "bucket",
      config.r2_buckets?.[0]?.bucket_name,
      other.r2_buckets?.[0]?.bucket_name,
    ],
    [
      "queue",
      config.queues?.producers?.[0]?.queue,
      other.queues?.producers?.[0]?.queue,
    ],
    [
      "dead-letter",
      config.queues?.consumers?.[0]?.dead_letter_queue,
      other.queues?.consumers?.[0]?.dead_letter_queue,
    ],
  ])
    add(
      `separate-${id}`,
      !!a && !!b && a !== b,
      `Separate ${id} names required; actual resources are checked externally.`,
    );
  add(
    "queue-contract",
    config.queues?.producers?.[0]?.queue ===
      config.queues?.consumers?.[0]?.queue &&
      config.queues?.consumers?.[0]?.max_batch_size === 1,
    "Producer/consumer queue must agree and preserve bounded processing.",
  );
  const ownQueues = [
    config.queues?.producers?.[0]?.queue,
    config.queues?.consumers?.[0]?.dead_letter_queue,
  ];
  const otherQueues = [
    other.queues?.producers?.[0]?.queue,
    other.queues?.consumers?.[0]?.dead_letter_queue,
  ];
  add(
    "queue-topology",
    ownQueues.every((name) => !!name && !otherQueues.includes(name)) &&
      ownQueues[0] !== ownQueues[1],
    "No producer or dead-letter queue may cross environment boundaries.",
  );
  let domain = "";
  try {
    domain = new URL(config.vars?.PUBLIC_APP_URL).hostname;
  } catch {}
  add(
    "custom-domain",
    !!domain &&
      config.routes?.some(
        (route: Record<string, unknown>) =>
          route.custom_domain === true && route.pattern === domain,
      ),
    "Declare the exact custom domain matching the staff origin.",
  );
  add(
    "observability",
    config.observability?.enabled === true &&
      config.observability?.redact_query_string === true &&
      config.observability?.logs?.invocation_logs === false,
    "Redacted telemetry without automatic request invocation logs required.",
  );
  add(
    "cpu-budget",
    Number.isFinite(config.limits?.cpu_ms) &&
      config.limits.cpu_ms > 0 &&
      config.limits.cpu_ms <= 1000,
    "Proposed CPU limit at most 1,000 ms; account support and workload must be reviewed.",
  );
  add(
    "cron",
    config.triggers?.crons?.includes("*/5 * * * *"),
    "Five-minute background schedule must be configured.",
  );
  if (templates) {
    add(
      "meta-default-off",
      config.vars?.META_LIVE_INTAKE_ENABLED === "false",
      "Template must not activate Meta retrieval.",
    );
    return checks;
  }
  const database = config.d1_databases?.[0]?.database_id,
    otherDatabase = other.d1_databases?.[0]?.database_id;
  add(
    "provisioned-database",
    typeof database === "string" &&
      /^[a-f0-9-]{36}$/i.test(database) &&
      database !== "00000000-0000-0000-0000-000000000000" &&
      database !== otherDatabase,
    "Configure a real, separate D1 ID; template IDs cannot pass.",
  );
  const origin = config.vars?.PUBLIC_APP_URL;
  const isPublicOrigin = (value: unknown) => {
    try {
      const u = new URL(String(value));
      return (
        u.protocol === "https:" &&
        !u.hostname.endsWith(".invalid") &&
        !["localhost", "127.0.0.1"].includes(u.hostname) &&
        u.pathname === "/" &&
        !u.search &&
        !u.hash &&
        !u.username &&
        !u.password
      );
    } catch {
      return false;
    }
  };
  add(
    "public-origin",
    isPublicOrigin(origin) && origin !== other.vars?.PUBLIC_APP_URL,
    "Set the exact distinct HTTPS staff origin; placeholders cannot pass.",
  );
  add(
    "access-config",
    /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(
      config.vars?.ACCESS_TEAM_DOMAIN || "",
    ) &&
      !!config.vars?.ACCESS_AUDIENCE &&
      config.vars.ACCESS_AUDIENCE !== other.vars?.ACCESS_AUDIENCE,
    "Configure Access team domain and a distinct application audience.",
  );
  const parsed = releaseEvidenceSchema.safeParse(evidence);
  add(
    "evidence-schema",
    parsed.success,
    "Provide the private release evidence document; no approvals are supplied by this tool.",
  );
  if (!parsed.success) return checks;
  add(
    "evidence-scope",
    parsed.data.environment === environment && parsed.data.commit === commit,
    "Evidence must identify this exact commit and environment.",
  );
  for (const gate of releaseGates) {
    if (
      environment === "staging" &&
      [
        "productionContentAndTerms",
        "rankingPolicy",
        "migrationCutover",
        "metaAcceptance",
      ].includes(gate)
    )
      continue;
    if (environment === "production" && gate === "stagingSyntheticData")
      continue;
    const item = parsed.data.gates[gate];
    const allowed =
      item.status === "approved" ||
      (item.status === "deferred" &&
        ["migrationCutover", "metaAcceptance"].includes(gate));
    const dated =
      !!item.reviewedAt &&
      Date.parse(item.reviewedAt) <= Date.now() &&
      Date.now() - Date.parse(item.reviewedAt) <= 30 * 86400000;
    add(
      `owner-${gate}`,
      allowed && !!item.reviewedBy && !!item.evidence && dated,
      `${gate}: explicit recent owner evidence required${["migrationCutover", "metaAcceptance"].includes(gate) ? "; documented deferral may retain manual-only operation" : ""}.`,
    );
  }
  if (config.vars?.META_LIVE_INTAKE_ENABLED === "true")
    add(
      "meta-live-evidence",
      parsed.data.gates.metaAcceptance.status === "approved",
      "Live Meta requires approved acceptance, not a deferral.",
    );
  return checks;
}
