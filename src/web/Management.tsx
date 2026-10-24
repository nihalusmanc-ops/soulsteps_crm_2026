import { useState } from "react";
import { ImportPreview } from "./ImportPreview";
import { MetaIntegration } from "./MetaIntegration";
import { ReleaseReadiness } from "./ReleaseReadiness";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "./components/ui/button";
import { Modal } from "./components/ui/modal";
import { management, useWorkspace } from "./data/management";
import {
  stageCodes,
  type WorkspaceSettings,
  type Rule,
  type RulePreview,
} from "../shared/management";
import { dateTime, type Trip } from "../shared/domain";
export function Management() {
  const [tab, setTab] = useState("health"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<WorkspaceSettings | null>(null),
    [release, setRelease] = useState(false);
  const cfg = useWorkspace(),
    client = useQueryClient();
  const jobs = useQuery({
    queryKey: ["management-jobs"],
    queryFn: management.jobs,
    refetchInterval: 5000,
  });
  const audit = useQuery({
    queryKey: ["management-audit"],
    queryFn: management.audit,
    enabled: tab === "audit",
  });
  async function act(work: () => Promise<unknown>, text: string) {
    setBusy(true);
    setError("");
    try {
      await work();
      await Promise.all([
        client.invalidateQueries({ queryKey: ["management-jobs"] }),
        client.invalidateQueries({ queryKey: ["settings"] }),
        client.invalidateQueries({ queryKey: ["management-audit"] }),
      ]);
      setMessage(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  const counts = jobs.data?.counts || [];
  const count = (status: string) =>
    counts.find((c) => c.status === status)?.count || 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MANAGER WORKSPACE</div>
          <h1>Keep the little things reliable.</h1>
          <p>
            In-app follow-ups, reviewed settings and a clear record of every
            change.
          </p>
        </div>
        <Button
          disabled={busy}
          onClick={() =>
            act(
              management.sweep,
              "Due checks requested. Results update as background jobs finish.",
            )
          }
        >
          Run due checks
        </Button>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="info-note">
          {message}
        </p>
      )}
      <div className="stats">
        <div className="stat">
          <span>Checks enabled</span>
          <strong>
            {cfg.settings.jobsPaused || cfg.settings.recoveryHold
              ? "Paused"
              : "Ready"}
          </strong>
          <small>
            {cfg.settings.recoveryHold
              ? "Recovery review required"
              : "In-app only · no customer sends"}
          </small>
        </div>
        <div className="stat">
          <span>Waiting / queued</span>
          <strong>{count("pending") + count("queued")}</strong>
          <small>Persisted before queue handoff</small>
        </div>
        <div className="stat warning">
          <span>Failed checks</span>
          <strong>{count("failed")}</strong>
          <small>Visible until reviewed and retried</small>
        </div>
        <div className="stat">
          <span>Completed checks</span>
          <strong>{count("succeeded")}</strong>
          <small>Repeated delivery creates no duplicate reminder</small>
        </div>
      </div>
      <section className="panel">
        <div className="tabs">
          {[
            ["health", "Health & retries"],
            ["settings", "Workspace settings"],
            ["audit", "Audit history"],
            ["imports", "Import preview"],
            ["meta", "Meta intake"],
            ["release", "Release readiness"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="management-content">
          {tab === "imports" && <ImportPreview />}
          {tab === "meta" && <MetaIntegration />}
          {tab === "release" && <ReleaseReadiness />}
          {tab === "health" && (
            <>
              {jobs.isError && <p role="alert">{jobs.error.message}</p>}
              <p className="micro">
                Last completed due check:{" "}
                {jobs.data?.health?.last_success
                  ? dateTime(jobs.data.health.last_success)
                  : "Not run yet"}
              </p>
              {jobs.data?.health?.last_error && (
                <p role="alert" className="notice">
                  {jobs.data.health.last_error}
                </p>
              )}
              <div className="section-head">
                <h2>Persistent checks</h2>
                <span className="muted">Refreshes every 5 seconds</span>
              </div>
              {jobs.isPending ? (
                <p>Loading checks…</p>
              ) : !jobs.data?.jobs.length ? (
                <p className="muted">
                  No checks recorded. Run due checks to reconcile existing
                  tasks.
                </p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Check / task</th>
                        <th>State</th>
                        <th>Current retry cycle</th>
                        <th>Next retry</th>
                        <th>Last error</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.data.jobs.map((job) => (
                        <tr key={job.id}>
                          <td>
                            <strong>
                              {job.kind === "backup"
                                ? "Private backup"
                                : "Due-task reminder"}
                            </strong>
                            {job.enquiry_id ? (
                              <small>
                                <Link to={`/enquiries/${job.enquiry_id}`}>
                                  {job.enquiry_id}
                                </Link>
                              </small>
                            ) : (
                              <small>{job.id}</small>
                            )}
                          </td>
                          <td>
                            <span
                              className={`badge ${job.status === "failed" ? "lost" : job.status === "succeeded" ? "confirmed" : "on_hold"}`}
                            >
                              {job.status}
                            </span>
                          </td>
                          <td>
                            {job.attempts} processed / {job.dispatch_attempts}{" "}
                            handoffs
                          </td>
                          <td>
                            {job.status === "failed"
                              ? "Manual retry required"
                              : job.status === "pending"
                                ? dateTime(job.next_retry_at)
                                : "—"}
                          </td>
                          <td className="wrap-cell">{job.last_error || "—"}</td>
                          <td>
                            {job.status === "failed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  act(
                                    () => management.retry(job.id),
                                    "Retry scheduled; the check retains its history.",
                                  )
                                }
                              >
                                Retry
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="section-head spaced">
                <h2>Private backups</h2>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    busy || cfg.settings.jobsPaused || cfg.settings.recoveryHold
                  }
                  onClick={() =>
                    act(
                      management.backup,
                      "Private snapshot requested. It includes receipt copies and checksums.",
                    )
                  }
                >
                  Create backup
                </Button>
              </div>
              <p className="micro">
                One daily snapshot is requested by due checks. Restore drills
                use a new isolated local database and hold restored jobs for
                review.
              </p>
              {jobs.data?.backups.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Created</th>
                        <th>Status</th>
                        <th>Contents</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.data.backups.map((b) => (
                        <tr key={b.id}>
                          <td>{dateTime(b.created_at)}</td>
                          <td>
                            {b.status}
                            <small>{b.last_error}</small>
                          </td>
                          <td>
                            {b.counts
                              ? `${JSON.parse(b.counts).enquiries} enquiries · ${JSON.parse(b.counts).files} receipts`
                              : "In progress / not available"}
                          </td>
                          <td>
                            {b.status === "succeeded" && (
                              <a
                                className="button outline small"
                                href={`/api/management/backups/${encodeURIComponent(b.id)}`}
                                download
                              >
                                Download private snapshot
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">No completed backup yet.</p>
              )}
              <div className="section-head spaced">
                <h2>Receipt storage review</h2>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    act(
                      management.reviewStorage,
                      "Receipt storage reviewed. No objects were deleted.",
                    )
                  }
                >
                  Review receipt storage
                </Button>
              </div>
              {jobs.data?.storage ? (
                <div className="notice">
                  <p>
                    {JSON.parse(jobs.data.storage.data).unlinked.length}{" "}
                    unlinked objects ·{" "}
                    {JSON.parse(jobs.data.storage.data).missing.length} missing
                    receipt references
                  </p>
                  <small>
                    Checked{" "}
                    {dateTime(JSON.parse(jobs.data.storage.data).checkedAt)}.
                    New uploads have a 15-minute grace period; no automatic
                    deletion.
                  </small>
                  {JSON.parse(jobs.data.storage.data).truncated && (
                    <small>
                      Review was capped at 5,000 objects. Missing-reference
                      checks require a full scan.
                    </small>
                  )}
                </div>
              ) : (
                <p className="micro">
                  Run checks or request a review to reconcile private receipt
                  references.
                </p>
              )}
              <details>
                <summary>Recent processing and handoff attempts</summary>
                {jobs.data?.attempts.slice(0, 30).map((a) => (
                  <p key={a.id} className="attempt-line">
                    {dateTime(a.at)} · {a.phase} · {a.outcome}
                    <small>
                      {a.job_id}
                      {a.error ? ` · ${a.error}` : ""}
                    </small>
                  </p>
                ))}
              </details>
            </>
          )}
          {tab === "settings" && (
            <>
              <div className="section-head">
                <h2>Operational defaults</h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEdit(structuredClone(cfg.settings))}
                >
                  Edit settings
                </Button>
              </div>
              <p className="muted">
                These are proposed business defaults. Appointments still require
                an accepted time. Changing hours never reschedules an agreed
                callback.
              </p>
              <div className="facts spaced">
                <div>
                  <span>Timezone</span>
                  <strong>Asia/Dubai</strong>
                </div>
                <div>
                  <span>Business hours</span>
                  <strong>
                    {cfg.settings.businessStart}–{cfg.settings.businessEnd}
                  </strong>
                </div>
                <div>
                  <span>Follow-up suggestion</span>
                  <strong>{cfg.settings.defaultFollowupHours} hours</strong>
                </div>
                <div>
                  <span>In-app reminder lead time</span>
                  <strong>{cfg.settings.reminderMinutes} minutes</strong>
                </div>
                <div>
                  <span>Retry budget</span>
                  <strong>{cfg.settings.maxAttempts} attempts</strong>
                </div>
                <div>
                  <span>Customer automation</span>
                  <strong>Disabled · manual WhatsApp</strong>
                </div>
              </div>
              {cfg.settings.recoveryHold && (
                <div className="notice">
                  <strong>Recovery hold is active</strong>
                  <p>
                    Review restored tasks and backup reconciliation before
                    resuming in-app checks.
                  </p>
                  <Button size="sm" onClick={() => setRelease(true)}>
                    Review and release hold
                  </Button>
                </div>
              )}
              <h3>Stage labels and colours</h3>
              <div className="stage-legend">
                {stageCodes.map((code) => (
                  <div key={code}>
                    <span
                      className="badge"
                      style={{
                        color: cfg.settings.stages[code].color,
                        border: `1px solid ${cfg.settings.stages[code].color}`,
                      }}
                    >
                      {cfg.settings.stages[code].label}
                    </span>
                    <small>{code}</small>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "audit" && (
            <>
              <h2>Recent audited changes</h2>
              <p className="micro">
                Permanent financial and activity history stays in the enquiry.
                This view shows the latest 100 operational audit entries.
              </p>
              {audit.isError ? (
                <p role="alert">{audit.error.message}</p>
              ) : audit.data?.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Actor</th>
                        <th>Action</th>
                        <th>Object</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.data.map((a) => (
                        <tr key={a.id}>
                          <td>{dateTime(a.created_at)}</td>
                          <td>{a.actor}</td>
                          <td>{a.action}</td>
                          <td className="wrap-cell">{a.object_id}</td>
                          <td className="wrap-cell">{a.data}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>Loading audit history…</p>
              )}
            </>
          )}
        </div>
      </section>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title="Edit workspace defaults"
        description="Versioned settings. Stage codes and past activity remain unchanged."
      >
        {edit && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await act(async () => {
                await management.saveSettings(edit);
                setEdit(null);
              }, "Workspace settings saved.");
            }}
          >
            <div className="form-grid">
              <label>
                Business start
                <input
                  type="time"
                  value={edit.businessStart}
                  onChange={(e) =>
                    setEdit({ ...edit, businessStart: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                Business end
                <input
                  type="time"
                  value={edit.businessEnd}
                  onChange={(e) =>
                    setEdit({ ...edit, businessEnd: e.target.value })
                  }
                  required
                />
              </label>
            </div>
            <fieldset className="weekday-picker">
              <legend>Working days</legend>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (day, i) => (
                  <label className="checkbox" key={day}>
                    <input
                      type="checkbox"
                      checked={edit.workingDays.includes(i)}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          workingDays: e.target.checked
                            ? [...edit.workingDays, i]
                            : edit.workingDays.filter((d) => d !== i),
                        })
                      }
                    />
                    {day}
                  </label>
                ),
              )}
            </fieldset>
            <div className="form-grid">
              <label>
                Follow-up suggestion · hours
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={edit.defaultFollowupHours}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      defaultFollowupHours: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Reminder lead time · minutes
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={edit.reminderMinutes}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      reminderMinutes: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label>
              Maximum processing / handoff attempts
              <input
                type="number"
                min={1}
                max={10}
                value={edit.maxAttempts}
                onChange={(e) =>
                  setEdit({ ...edit, maxAttempts: Number(e.target.value) })
                }
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={edit.jobsPaused}
                onChange={(e) =>
                  setEdit({ ...edit, jobsPaused: e.target.checked })
                }
              />
              Pause in-app background checks
            </label>
            {stageCodes.map((code) => (
              <div className="stage-editor" key={code}>
                <label>
                  {code}
                  <input
                    value={edit.stages[code].label}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        stages: {
                          ...edit.stages,
                          [code]: {
                            ...edit.stages[code],
                            label: e.target.value,
                          },
                        },
                      })
                    }
                    required
                    maxLength={40}
                  />
                </label>
                <label>
                  Colour
                  <input
                    type="color"
                    aria-label={`${code} colour`}
                    value={edit.stages[code].color}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        stages: {
                          ...edit.stages,
                          [code]: {
                            ...edit.stages[code],
                            color: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </label>
              </div>
            ))}
            <p className="micro">
              Colours must remain readable on white. Customer messages stay
              disabled.
            </p>
            {error && (
              <p role="alert" className="notice">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              Save defaults
            </Button>
          </form>
        )}
      </Modal>
      <Modal
        open={release}
        onClose={() => setRelease(false)}
        title="Release recovery hold"
        description="Review restored tasks and balances first. This resumes only in-app checks."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await act(
              () => management.release(cfg.settings.version),
              "Recovery hold released for in-app checks only.",
            );
            setRelease(false);
          }}
        >
          <label className="checkbox">
            <input type="checkbox" required />I reviewed restored tasks, receipt
            availability and financial records.
          </label>
          <Button type="submit" disabled={busy}>
            Resume in-app checks
          </Button>
        </form>
      </Modal>
    </>
  );
}
export function RuleManager({
  tripId,
  done,
}: {
  tripId: string;
  done: () => void;
}) {
  const query = useQuery({
    queryKey: ["rules", tripId],
    queryFn: () => management.rules(tripId),
  });
  const [rules, setRules] = useState<Rule[] | null>(null),
    [preview, setPreview] = useState<RulePreview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const active = rules || query.data?.rules;
  async function review() {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      setPreview(await management.preview(tripId, active));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rule-manager">
      {query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : !active ? (
        <p>Loading trip rules…</p>
      ) : (
        <>
          <p className="micro">
            Active version:{" "}
            {query.data?.activeVersion || "None — draft defaults"}. Unknown and
            mixed visas always need qualification. Family/friends with all visas
            remain disabled until reviewed.
          </p>
          <div className="rules-editor">
            {active.map((rule, i) => (
              <div className="rule-editor" key={rule.id}>
                <label className="checkbox">
                  <input
                    aria-label={`Enable ${rule.group} ${rule.visa}`}
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => {
                      const next = structuredClone(active);
                      next[i].enabled = e.target.checked;
                      setRules(next);
                      setPreview(null);
                    }}
                  />
                  {rule.group} · {rule.visa} visas
                </label>
                <select
                  aria-label={`Rank ${rule.group} ${rule.visa}`}
                  value={rule.rank}
                  onChange={(e) => {
                    const next = structuredClone(active);
                    next[i].rank = e.target.value as Rule["rank"];
                    setRules(next);
                    setPreview(null);
                  }}
                >
                  {["P1", "P2", "P3", "P4", "P5", "P6"].map((rank) => (
                    <option key={rank}>{rank}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <Button disabled={busy} onClick={review}>
            Preview affected enquiries
          </Button>
          {preview && (
            <>
              <div className="notice">
                <strong>
                  {preview.rows.filter((r) => !r.preserved).length} enquiries
                  will be recomputed
                </strong>
                <p>
                  {preview.rows.filter((r) => r.preserved).length} overrides and
                  closed records preserved. Preview expires{" "}
                  {dateTime(preview.expiresAt)}.
                </p>
              </div>
              <details>
                <summary>Check all group and visa examples</summary>
                {preview.examples.map((e) => (
                  <p key={`${e.group}-${e.visa}`}>
                    {e.group} / {e.visa} → {e.rank || "Needs qualification"}
                  </p>
                ))}
              </details>
              <div className="rule-preview">
                {preview.rows.map((row) => (
                  <div key={row.id}>
                    <span>
                      {row.name}
                      <small>{row.reason}</small>
                    </span>
                    <span>
                      {row.before || "Needs qualification"} →{" "}
                      {row.after || "Needs qualification"}
                    </span>
                  </div>
                ))}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    await management.publish(tripId, preview.id);
                    await client.invalidateQueries({ queryKey: ["crm"] });
                    await client.invalidateQueries({ queryKey: ["rules"] });
                    done();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Publication failed. Preview again.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label className="checkbox">
                  <input type="checkbox" required />I reviewed these rules and
                  the affected profiles. Publish this version and recompute the
                  listed enquiries.
                </label>
                <Button disabled={busy} type="submit">
                  Publish reviewed rules
                </Button>
              </form>
            </>
          )}
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
export function PublishTrip({ trip, done }: { trip: Trip; done: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const missing = [
    !trip.departure && "departure date",
    trip.price === null && "approved price",
    trip.deposit === null && "deposit terms",
    !trip.itinerary && "approved itinerary",
  ].filter(Boolean);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await management.publishContent(trip.id, trip.version);
          await client.invalidateQueries({ queryKey: ["crm"] });
          done();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Publication failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Publish version {trip.version} for manual CRM use. Offered quotations
        keep their original terms.
      </p>
      <div className="notice">
        <strong>Content still pending</strong>
        <p>
          {missing.length
            ? missing.join(", ")
            : "No missing fields in this draft."}
        </p>
        <p>Automatic itinerary and price delivery remain unavailable.</p>
      </div>
      <label className="checkbox">
        <input required type="checkbox" />I reviewed this draft and approve it
        for manual staff use.
      </label>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={busy}>
        Publish for manual use
      </Button>
    </form>
  );
}
