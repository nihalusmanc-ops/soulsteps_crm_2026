import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request, mutate } from "./data/api";
import { Button } from "./components/ui/button";
import {
  syntheticPage,
  syntheticForm,
  type MetaMapping,
  type MetaStatus,
} from "../shared/meta";
const defaults: MetaMapping = {
  pageId: syntheticPage,
  formId: syntheticForm,
  version: 0,
  schemaVersion: "v3",
  tripId: "",
  ownerId: "",
  enabled: true,
  reviewed: true,
  reason: "",
  fields: {
    name: "full_name",
    phone: "phone_number",
    email: "email",
    group: "group",
    visa: "visa",
    decisionTimeframe: "booking_timeframe",
    travelSelection: "travel_selection",
  },
};
export function MetaIntegration() {
  const client = useQueryClient(),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<MetaMapping>(defaults),
    [source, setSource] = useState<unknown>(null);
  const status = useQuery({
    queryKey: ["meta-status"],
    queryFn: () => request<MetaStatus>("/management/meta/status"),
    refetchInterval: 5000,
  });
  const options = useQuery({
    queryKey: ["import-options"],
    queryFn: () =>
      request<{
        trips: { id: string; name: string }[];
        owners: { id: string; name: string }[];
      }>("/management/imports/options"),
  });
  async function act(work: () => Promise<unknown>, text: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      await Promise.all([
        client.invalidateQueries({ queryKey: ["meta-status"] }),
        client.invalidateQueries({ queryKey: ["crm"] }),
      ]);
      setMessage(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Meta action failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="eyebrow">META LEAD INTAKE · NO CUSTOMER MESSAGING</div>
      <h2>Every lead has a traceable arrival.</h2>
      <p>
        Signed notifications are saved before retrieval. Reviewed form IDs
        select the trip and owner. Unknown forms stay here for review; submitted
        answers do not establish buying interest, consent or a WhatsApp session.
      </p>
      {status.isError && <p role="alert">{status.error.message}</p>}
      {options.isError && <p role="alert">{options.error.message}</p>}
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
      {status.data && (
        <>
          <div className="notice">
            <strong>
              {status.data.connection.liveEnabled &&
              status.data.connection.credentialsReady
                ? "Live retrieval configured — verify assets before release"
                : "Live Meta is not connected"}
            </strong>
            <p>
              {status.data.connection.local
                ? "Local synthetic fixtures only. Real Meta requests are disabled."
                : "Credentials and activation are managed on the server."}
            </p>
          </div>
          <p>
            {status.data.counts
              .map((c) => `${c.status}: ${c.count}`)
              .join(" · ") || "No lead notifications received."}
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              act(
                () => mutate("/management/meta/sweep", {}),
                "Pending lead jobs checked.",
              )
            }
          >
            Check pending leads
          </Button>
          {status.data.connection.local && (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                margin: "16px 0",
              }}
            >
              {(["mapped", "unknown", "retry"] as const).map((scenario) => (
                <Button
                  key={scenario}
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => mutate("/management/meta/fixture", { scenario }),
                      "Fictional event saved; background processing will update its status.",
                    )
                  }
                >
                  {scenario === "mapped"
                    ? "Add mapped fixture"
                    : scenario === "unknown"
                      ? "Add unknown-form fixture"
                      : "Simulate one retrieval failure"}
                </Button>
              ))}
            </div>
          )}
          <h3>Reviewed form mappings</h3>
          <p>
            The initial IDs and field names below are fictional examples.
            Configure exact submitted field keys; question wording is not a
            travel-date answer. Changes apply to future processing attempts and
            leave existing enquiries unchanged.
          </p>
          {status.data.forms.map((form) => (
            <div className="notice" key={form.id}>
              <strong style={{ overflowWrap: "anywhere" }}>
                Page {form.data.pageId} · Form {form.data.formId} · v
                {form.version} · {form.data.enabled ? "Enabled" : "Disabled"}
              </strong>
              <p>
                Last reconciliation: {form.last_scan_at || "Never"} · scanned{" "}
                {form.last_scan_count ?? 0} IDs
                {form.cursor ? " · more pages available" : ""}
              </p>
              <Button disabled={busy} onClick={() => setEdit(form.data)}>
                Edit mapping
              </Button>{" "}
              <Button
                disabled={
                  busy ||
                  status.data!.connection.local ||
                  !status.data!.connection.credentialsReady ||
                  !status.data!.connection.liveEnabled
                }
                onClick={() =>
                  act(
                    () =>
                      mutate("/management/meta/reconcile", {
                        pageId: form.data.pageId,
                        formId: form.data.formId,
                        restart: true,
                      }),
                    "Scanned up to 25 recent lead IDs; duplicates were retained once.",
                  )
                }
              >
                Scan latest 25 IDs
              </Button>{" "}
              {form.cursor && (
                <Button
                  disabled={
                    busy ||
                    status.data.connection.local ||
                    !status.data.connection.liveEnabled
                  }
                  onClick={() =>
                    act(
                      () =>
                        mutate("/management/meta/reconcile", {
                          pageId: form.data.pageId,
                          formId: form.data.formId,
                          restart: false,
                        }),
                      "Backfill page saved.",
                    )
                  }
                >
                  Continue backfill
                </Button>
              )}
            </div>
          ))}
          <form
            key={`${edit.pageId}:${edit.formId}:${edit.version}`}
            style={{ display: "grid", gap: 12, marginTop: 16 }}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const fields = { ...edit.fields };
              for (const field of Object.keys(
                fields,
              ) as (keyof MetaMapping["fields"])[])
                fields[field] = String(data.get(`field:${field}`) || "");
              const input = {
                ...edit,
                pageId: String(data.get("pageId")),
                formId: String(data.get("formId")),
                tripId: String(data.get("tripId")),
                ownerId: String(data.get("ownerId")),
                schemaVersion: String(data.get("schemaVersion")),
                reason: String(data.get("reason")),
                enabled: data.get("enabled") === "on",
                fields,
              };
              void act(async () => {
                const result = await mutate<{ version: number }>(
                  "/management/meta/forms",
                  input,
                  "PUT",
                );
                setEdit({
                  ...input,
                  schemaVersion: input.schemaVersion as "v2" | "v3",
                  version: result.version,
                });
              }, "Reviewed mapping saved. Retry quarantined leads explicitly.");
            }}
          >
            <label>
              Meta Page ID
              <input
                name="pageId"
                required
                pattern="[0-9]+"
                defaultValue={edit.pageId}
                readOnly={edit.version > 0}
              />
            </label>
            <label>
              Meta Form ID
              <input
                name="formId"
                required
                pattern="[0-9]+"
                defaultValue={edit.formId}
                readOnly={edit.version > 0}
              />
            </label>
            <label>
              Source schema
              <select name="schemaVersion" defaultValue={edit.schemaVersion}>
                <option value="v2">v2</option>
                <option value="v3">v3</option>
              </select>
            </label>
            <label>
              Trip for Meta form
              <select
                aria-label="Trip for Meta form"
                name="tripId"
                required
                defaultValue={edit.tripId}
              >
                <option value="">Choose trip</option>
                {options.data?.trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Staff owner for Meta form
              <select
                aria-label="Staff owner for Meta form"
                name="ownerId"
                required
                defaultValue={edit.ownerId}
              >
                <option value="">Choose staff</option>
                {options.data?.owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            {(Object.keys(edit.fields) as (keyof MetaMapping["fields"])[]).map(
              (field) => (
                <label key={field}>
                  Submitted field: {field}
                  <input
                    name={`field:${field}`}
                    required
                    defaultValue={edit.fields[field]}
                  />
                </label>
              ),
            )}
            <label>
              Mapping review reason
              <input
                name="reason"
                required
                minLength={8}
                maxLength={2000}
                defaultValue={edit.reason}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={edit.enabled}
              />
              Enable this reviewed form mapping
            </label>
            <label className="checkbox">
              <input type="checkbox" required />I reviewed the exact form IDs,
              submitted field keys, trip and owner.
            </label>
            <div>
              <Button type="submit" disabled={busy || !options.data}>
                Save reviewed Meta mapping
              </Button>{" "}
              <Button
                type="button"
                onClick={() => setEdit({ ...defaults, formId: "", pageId: "" })}
              >
                New mapping
              </Button>
            </div>
          </form>
          <h3>Recent lead deliveries</h3>
          <p>
            Latest 100 records; counts above cover all statuses. Retries keep
            one source/enquiry per lead ID.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Lead / source</th>
                  <th>State / attempts</th>
                  <th>Next action</th>
                </tr>
              </thead>
              <tbody>
                {status.data.leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <strong>{lead.id}</strong>
                      <small>
                        Page {lead.page_id} · Form {lead.form_id}
                      </small>
                      <small>
                        {lead.mode} · received {lead.received_at}
                      </small>
                    </td>
                    <td>
                      {lead.status} · {lead.attempts}
                      <small>{lead.last_error}</small>
                    </td>
                    <td>
                      <Button
                        disabled={busy}
                        onClick={() =>
                          act(
                            async () =>
                              setSource(
                                await request(
                                  `/management/meta/leads/${lead.id}`,
                                ),
                              ),
                            "Source loaded for review.",
                          )
                        }
                      >
                        Review source
                      </Button>
                      {["review", "blocked", "failed", "held"].includes(
                        lead.status,
                      ) && (
                        <Button
                          disabled={busy}
                          onClick={() =>
                            act(
                              () =>
                                mutate("/management/meta/retry", {
                                  id: lead.id,
                                }),
                              "Lead marked for retry. Check pending leads to process it.",
                            )
                          }
                        >
                          Retry lead
                        </Button>
                      )}
                      {lead.mode === "live" &&
                        ["review", "blocked", "failed", "held"].includes(
                          lead.status,
                        ) && (
                          <Button
                            disabled={busy}
                            onClick={() =>
                              act(
                                () =>
                                  mutate("/management/meta/retry", {
                                    id: lead.id,
                                    refetch: true,
                                  }),
                                "Previous source archived in audit; fresh retrieval requested.",
                              )
                            }
                          >
                            Retrieve again
                          </Button>
                        )}
                      {lead.enquiry_id && (
                        <a href={`/enquiries/${lead.enquiry_id}`}>
                          Open enquiry
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {source !== null && (
            <details open>
              <summary>Preserved source evidence</summary>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {JSON.stringify(source, null, 2)}
              </pre>
            </details>
          )}
        </>
      )}
    </section>
  );
}
