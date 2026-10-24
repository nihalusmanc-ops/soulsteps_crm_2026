import { useQuery } from "@tanstack/react-query";
import { request } from "./data/api";
import type { operationalReadiness } from "../server/release";
type Readiness = Awaited<ReturnType<typeof operationalReadiness>>;
export function ReleaseReadiness() {
  const query = useQuery({
    queryKey: ["release-readiness"],
    queryFn: () => request<Readiness>("/management/release"),
    refetchInterval: 30000,
  });
  return (
    <section>
      <div className="eyebrow">MANAGER OPERATIONS</div>
      <h2>Prepare a release with evidence.</h2>
      <p>
        These are live CRM diagnostics. Release approval and cloud billing
        cannot be established from local checks.
      </p>
      {query.isPending && <p>Checking operational state…</p>}
      {query.isError && <p role="alert">{query.error.message}</p>}
      {query.data && (
        <>
          <div className="notice">
            <strong>Release approval requires external evidence</strong>
            <p>
              Environment: {query.data.environment}. Checked{" "}
              {query.data.checkedAt}. No customer messaging is enabled.
            </p>
          </div>
          <div className="stats">
            <div className="stat">
              <span>Enquiries</span>
              <strong>{query.data.metrics.enquiries}</strong>
              <small>Actual database count</small>
            </div>
            <div className="stat">
              <span>Pending / overdue tasks</span>
              <strong>
                {query.data.metrics.pendingTasks} /{" "}
                {query.data.metrics.overdueTasks}
              </strong>
              <small>In-app work only</small>
            </div>
            <div className="stat">
              <span>Cloud billing / budget alerts</span>
              <strong>Unverified</strong>
              <small>No account spend or alert state is available here.</small>
            </div>
          </div>
          {query.data.checks.map((check) => (
            <div className="notice" key={check.id}>
              <strong>
                {check.title} · {check.status}
              </strong>
              <p>{check.detail}</p>
            </div>
          ))}
          <h3>Usage and incident review</h3>
          <p>
            Use Cloudflare account analytics for Worker requests/CPU, D1 rows
            read/written, R2 storage/operations and Queue backlog/dead letters.
            This view shows CRM counts, not billable usage.
          </p>
          <p>
            Proposed checks: investigate a heartbeat older than 15 minutes, a
            backup older than 26 hours, failed jobs and unresolved Meta
            deliveries. Agree the budget, alert thresholds, recipients and
            recovery owner before release. Budget alerts notify; they do not cap
            spending.
          </p>
          <p>
            Release evidence must include staff workflow, restore results,
            Access and storage checks, approved content/rules, migration
            reconciliation and rollback instructions. The repository release
            checker reports missing evidence without deploying.
          </p>
        </>
      )}
    </section>
  );
}
