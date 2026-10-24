import { useState } from "react";
import { request } from "./data/api";
import type { ImportPreview as Preview } from "../shared/import-preview";
import { Button } from "./components/ui/button";

export function ImportPreview() {
  const [preview, setPreview] = useState<
    (Preview & { checksum: string }) | null
  >(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel" style={{ padding: 24, marginTop: 24 }}>
      <div className="eyebrow">HISTORICAL IMPORT · REVIEW ONLY</div>
      <h2>Check the source before it becomes CRM data.</h2>
      <p>
        Preview a synthetic v2/v3 JSON fixture. Nothing is saved or added to
        live enquiries. Original Excel mapping and commit are still pending.
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
            setError("");
            if (!file) return;
            if (file.size > 1024 * 1024) {
              setError("Choose a file smaller than 1 MB.");
              return;
            }
            setBusy(true);
            try {
              setPreview(
                await request<Preview & { checksum: string }>(
                  "/management/imports/preview",
                  { method: "POST", body: await file.text() },
                ),
              );
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
          <Button disabled>Commit unavailable — preview checkpoint</Button>
        </>
      )}
    </section>
  );
}
