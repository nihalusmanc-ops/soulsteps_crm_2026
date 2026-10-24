import { Hono } from "hono";
import type { AppEnv, Bindings } from "./types";
import { requireManager, localFixtureAllowed } from "./auth";
import { readSettings } from "./settings";
export type ReadinessCheck = {
  id: string;
  status: "pass" | "attention" | "blocked" | "external";
  title: string;
  detail: string;
};
export async function operationalReadiness(env: Bindings, local: boolean) {
  const db = env.DB,
    now = new Date(),
    settings = await readSettings(db);
  const results = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT COUNT(*) AS enquiries FROM enquiries"),
    db
      .prepare(
        "SELECT COUNT(*) AS pending,SUM(CASE WHEN due_at<? THEN 1 ELSE 0 END) AS overdue FROM tasks WHERE status='pending'",
      )
      .bind(now.toISOString()),
    db.prepare(
      "SELECT COUNT(*) AS failed FROM scheduled_actions WHERE status='failed'",
    ),
    db.prepare(
      "SELECT status,COUNT(*) AS count FROM meta_leads GROUP BY status",
    ),
    db.prepare(
      "SELECT completed_at FROM backup_runs WHERE status='succeeded' AND checksum IS NOT NULL ORDER BY completed_at DESC LIMIT 1",
    ),
    db.prepare(
      "SELECT last_success,last_error FROM service_status WHERE id='due_checks'",
    ),
    db.prepare(
      "SELECT COUNT(*) AS staff FROM users WHERE role='staff' AND active=1",
    ),
    db.prepare("SELECT COUNT(*) AS fixtures FROM users WHERE id LIKE 'DEMO-%'"),
    db.prepare(
      "SELECT COUNT(*) AS total,SUM(CASE WHEN json_extract(data,'$.status')='published' AND json_extract(data,'$.price')>0 AND json_extract(data,'$.deposit')>0 AND json_extract(data,'$.activeRuleVersion')>0 THEN 1 ELSE 0 END) AS configured FROM trips",
    ),
    db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('enquiry_customer','task_enquiry_status_due','activity_enquiry_time','payment_enquiry_status','meta_pending_retry')",
    ),
  ]);
  const first = (i: number) => results[i].results[0] || {};
  const backup = first(4).completed_at as string | undefined,
    heartbeat = first(5).last_success as string | undefined;
  const recent = (value: string | undefined, hours: number) =>
    !!value &&
    now.getTime() >= Date.parse(value) &&
    now.getTime() - Date.parse(value) <= hours * 3600000;
  const checks: ReadinessCheck[] = [
    {
      id: "mode",
      status: local ? "blocked" : "pass",
      title: "Runtime identity mode",
      detail: local
        ? "Fictional local mode cannot establish staging or production release acceptance."
        : "Staff authentication is required; test the deployed Access boundary separately.",
    },
    {
      id: "staff",
      status: Number(first(6).staff) > 0 ? "pass" : "blocked",
      title: "Staff assignments",
      detail: `${Number(first(6).staff)} active staff identities available.`,
    },
    {
      id: "fixtures",
      status: Number(first(7).fixtures) > 0 ? "blocked" : "pass",
      title: "Demo identity separation",
      detail: `${Number(first(7).fixtures)} demo identities present. Never release a database seeded with demo identities.`,
    },
    {
      id: "checks",
      status:
        settings.jobsPaused || settings.recoveryHold ? "attention" : "pass",
      title: "Background processing",
      detail: settings.recoveryHold
        ? "Recovery hold is active; review before release."
        : settings.jobsPaused
          ? "Checks are paused."
          : "In-app checks enabled. No customer-send capability.",
    },
    {
      id: "heartbeat",
      status:
        recent(heartbeat, 0.25) && !first(5).last_error ? "pass" : "attention",
      title: "Background heartbeat",
      detail: heartbeat
        ? `Last successful sweep: ${heartbeat}`
        : "No successful sweep recorded.",
    },
    {
      id: "backup",
      status: recent(backup, 26) ? "pass" : "attention",
      title: "Private backup freshness",
      detail: backup
        ? `Last completed checksum-bearing snapshot: ${backup}. A completed snapshot is not a restore drill.`
        : "No completed private backup recorded.",
    },
    {
      id: "failures",
      status: Number(first(2).failed) > 0 ? "attention" : "pass",
      title: "Failed in-app jobs",
      detail: `${Number(first(2).failed)} jobs need review.`,
    },
    {
      id: "indexes",
      status: results[9].results.length === 5 ? "pass" : "blocked",
      title: "Core query indexes",
      detail: `${results[9].results.length}/5 required lookup indexes present.`,
    },
    {
      id: "content",
      status:
        Number(first(8).total) > 0 &&
        Number(first(8).configured) === Number(first(8).total)
          ? "attention"
          : "blocked",
      title: "Trip content and ranking review",
      detail: `${Number(first(8).configured) || 0}/${Number(first(8).total)} trips have published prices, deposit and rules. Owner approval of actual terms and ranking still required.`,
    },
    {
      id: "external",
      status: "external",
      title: "Cloud controls and owner approvals",
      detail:
        "Access policies, private R2, environment isolation, current billing/alerts, retention, restore evidence, Meta acceptance and cutover approvals require external verification.",
    },
  ];
  return {
    checkedAt: now.toISOString(),
    environment: env.APP_ENV,
    releaseApproved: null,
    checks,
    metrics: {
      enquiries: Number(first(0).enquiries),
      pendingTasks: Number(first(1).pending),
      overdueTasks: Number(first(1).overdue) || 0,
      failedJobs: Number(first(2).failed),
      meta: results[3].results,
    },
    cloudBilling: { verified: false, spend: null, alertsConfigured: null },
    outboundMessaging: false,
  };
}
export const releaseRoutes = new Hono<AppEnv>();
releaseRoutes.get("/management/release", async (c) => {
  requireManager(c);
  return c.json(
    await operationalReadiness(c.env, localFixtureAllowed(c.req.url, c.env)),
  );
});
