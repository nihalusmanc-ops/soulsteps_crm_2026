import { useState } from "react";
import { request } from "./data/api";
import { mutate } from "./data/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImportBatch, StoredImportRow } from "../shared/imports";
import type { ImportPreview as Preview } from "../shared/import-preview";
import { Button } from "./components/ui/button";

export function ImportPreview() {
  const [preview, setPreview] = useState<
    (Preview & { checksum: string }) | null
  >(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState("");
  const [batchId, setBatchId] = useState("");
  const client = useQueryClient();
  return (
    <section className="panel" style={{ padding: 24, marginTop: 24 }}>
      <div className="eyebrow">HISTORICAL IMPORT · MANAGER REVIEW</div>
      <h2>Check the source before it becomes CRM data.</h2>
      <p>
        Preview a synthetic v2/v3 JSON fixture, then save a private batch for
        review. Only explicitly reviewed and selected rows can become enquiries.
        Original Excel mappings need owner review.
      </p>
      <a href="/samples/import-preview.json" download>
        Download synthetic fixture
      </a>
      <label style={{ display: "block", marginTop: 16 }}>
        Choose preview JSON
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            setPreview(null);
            setSource("");
            setError("");
            if (!file) return;
            if (file.size > 1024 * 1024) {
              setError("Choose a file smaller than 1 MB.");
              return;
            }
            setBusy(true);
            try {
              const text = await file.text();
              setPreview(
                await request<Preview & { checksum: string }>(
                  "/management/imports/preview",
                  { method: "POST", body: text },
                ),
              );
              setSource(text);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Preview failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {busy && <p role="status">Checking source rows…</p>}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {preview && (
        <>
          <p role="status">
            {preview.sheet}: {preview.counts.candidate} candidates ·{" "}
            {preview.counts.review} need review · {preview.counts.skip} excluded
          </p>
          <p style={{ overflowWrap: "anywhere" }}>
            SHA-256: {preview.checksum}
          </p>
          {preview.rows.map((row) => (
            <details key={row.row} style={{ marginBottom: 16 }}>
              <summary>
                Row {row.row} · {row.name || "Blank"} · {row.version} ·{" "}
                {row.status}
              </summary>
              <p>
                Source ID: {row.sourceId || "Missing"} · Group:{" "}
                {row.group || "Unknown"} · Visa: {row.visa || "Unknown"}
              </p>
              <ul>
                {row.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p>Original notes: {row.notes.join(" / ") || "None"}</p>
              <p>
                Original style identifiers:{" "}
                {row.raw.styles.join(", ") || "None"}. Colours have no assigned
                CRM meaning.
              </p>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {JSON.stringify(row.raw.cells, null, 2)}
              </pre>
            </details>
          ))}
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const saved = await request<ImportBatch>(
                  "/management/imports/batches",
                  { method: "POST", body: source },
                );
                setBatchId(saved.id);
                await client.invalidateQueries({
                  queryKey: ["import-batches"],
                });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Save failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save private review batch
          </Button>
        </>
      )}
      <PersistentImports batchId={batchId} setBatchId={setBatchId} />
    </section>
  );
}

function PersistentImports({
  batchId,
  setBatchId,
}: {
  batchId: string;
  setBatchId: (id: string) => void;
}) {
  const client = useQueryClient();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]),
    [confirmed, setConfirmed] = useState(false);
  const history = useQuery({
    queryKey: ["import-batches"],
    queryFn: () =>
      request<{ id: string; created_at: string; sheet?: string }[]>(
        "/management/imports/batches",
      ),
  });
  const options = useQuery({
    queryKey: ["import-options"],
    queryFn: () =>
      request<{
        trips: { id: string; name: string }[];
        owners: { id: string; name: string }[];
      }>("/management/imports/options"),
  });
  const batch = useQuery({
    queryKey: ["import-batch", batchId],
    queryFn: () =>
      request<ImportBatch>(`/management/imports/batches/${batchId}`),
    enabled: !!batchId,
  });
  async function act(work: () => Promise<ImportBatch>) {
    setBusy(true);
    setError("");
    try {
      const result = await work();
      client.setQueryData(["import-batch", batchId], result);
      setSelected([]);
      setConfirmed(false);
      await client.invalidateQueries({ queryKey: ["crm"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import action failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ marginTop: 24 }} data-testid="saved-imports">
      <h3>Saved batches & quarantine</h3>
      {history.isError && <p role="alert">{history.error.message}</p>}
      {options.isError && <p role="alert">{options.error.message}</p>}
      <label>
        Review batch
        <select
          value={batchId}
          onChange={(e) => {
            setBatchId(e.target.value);
            setSelected([]);
            setConfirmed(false);
          }}
        >
          <option value="">Choose a saved batch</option>
          {history.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.sheet || b.id.slice(7, 19)} ·{" "}
              {new Date(b.created_at).toLocaleDateString("en-GB")}
            </option>
          ))}
        </select>
      </label>
      {batch.isError && <p role="alert">{batch.error.message}</p>}
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {batch.data && (
        <>
          <p role="status">
            {batch.data.counts.review} quarantined · {batch.data.counts.ready}{" "}
            ready · {batch.data.counts.committed} imported ·{" "}
            {batch.data.counts.skip} skipped · 0 updated
          </p>
          <p>
            Mapping: {batch.data.mapping_version}. Re-imports preserve existing
            enquiries; operational fields are never overwritten.
          </p>
          <a
            href={`/api/management/imports/batches/${batchId}/source`}
            download
          >
            Download preserved source
          </a>
          {batch.data.rows.map((row) => (
            <details key={row.id} style={{ marginTop: 16 }}>
              <summary>
                Row {row.row_number} · {row.data.name || "Blank"} · {row.status}
              </summary>
              <p>{row.data.reasons.join(" · ")}</p>
              <p>Original notes: {row.data.notes.join(" / ") || "None"}</p>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {JSON.stringify(row.data.raw, null, 2)}
              </pre>
              {row.error && <p role="alert">{row.error}</p>}
              {row.enquiry_id && (
                <a href={`/enquiries/${row.enquiry_id}`}>
                  Open preserved enquiry
                </a>
              )}
              {row.status === "ready" && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    disabled={busy}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, row.id]
                          : selected.filter((id) => id !== row.id),
                      )
                    }
                  />
                  Select row {row.row_number} for commit
                </label>
              )}
              {(row.status === "review" || row.status === "ready") && (
                <RowReview
                  key={`${row.id}:${row.revision}`}
                  row={row}
                  options={options.data}
                  busy={busy}
                  save={(input) =>
                    act(() =>
                      mutate<ImportBatch>(
                        `/management/imports/batches/${batchId}/rows/${encodeURIComponent(row.id)}`,
                        input,
                        "PUT",
                      ),
                    )
                  }
                />
              )}
            </details>
          ))}
          <p>
            Commit up to 25 selected rows at a time. Errors remain on their rows
            for correction/retry. No calls, follow-ups, payments, bookings or
            messages are created.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed the selected rows, source notes, trip and staff
            assignments.
          </label>
          <Button
            disabled={
              busy || !confirmed || !selected.length || selected.length > 25
            }
            onClick={() =>
              act(() =>
                mutate<ImportBatch>(
                  `/management/imports/batches/${batchId}/commit`,
                  { rows: selected, confirmed: true },
                ),
              )
            }
          >
            Commit {selected.length} selected rows
          </Button>
        </>
      )}
    </div>
  );
}

function RowReview({
  row,
  options,
  busy,
  save,
}: {
  row: StoredImportRow;
  options?: {
    trips: { id: string; name: string }[];
    owners: { id: string; name: string }[];
  };
  busy: boolean;
  save: (input: unknown) => Promise<void>;
}) {
  const blocked =
    row.data.version === "unknown" ||
    row.data.reasons.some((r) =>
      /Duplicate external ID|Incomplete row shape|Missing or invalid external ID|Missing name/.test(
        r,
      ),
    );
  if (blocked)
    return (
      <p>
        Mapping or identity needs correction in a new source batch. This row
        stays quarantined.
      </p>
    );
  return (
    <form
      style={{ display: "grid", gap: 12, marginTop: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        void save({
          revision: row.revision,
          tripId: form.get("tripId"),
          ownerId: form.get("ownerId"),
          acknowledged: true,
          verifiedPhone: form.get("verifiedPhone") === "on",
          reason: form.get("reason"),
        });
      }}
    >
      <label>
        Trip for row {row.row_number}
        <select
          aria-label={`Trip for row ${row.row_number}`}
          name="tripId"
          required
          defaultValue={row.review?.tripId || ""}
        >
          <option value="">Choose trip</option>
          {options?.trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Owner for row {row.row_number}
        <select
          name="ownerId"
          aria-label={`Owner for row ${row.row_number}`}
          required
          defaultValue={row.review?.ownerId || ""}
        >
          <option value="">Choose staff</option>
          {options?.owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Review reason for row {row.row_number}
        <input
          name="reason"
          required
          minLength={8}
          maxLength={2000}
          defaultValue={row.review?.reason || ""}
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          name="verifiedPhone"
          disabled={!row.data.phone}
          defaultChecked={row.review?.verifiedPhone || false}
        />
        I independently verified this complete phone belongs to this person.
        Otherwise create an unmatched contact without a WhatsApp number.
      </label>
      <label className="checkbox">
        <input type="checkbox" required />I reviewed source notes and dates.
        Keep buying interest unassessed and trip fit in Needs qualification.
      </label>
      <Button disabled={busy || !options} type="submit">
        Approve row {row.row_number}
      </Button>
    </form>
  );
}
