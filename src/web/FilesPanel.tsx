import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { receipts } from "./data/api";
import { Button } from "./components/ui/button";
import type { Enquiry } from "../shared/domain";
export function FilesPanel({
  enquiry,
  saving = false,
}: {
  enquiry: Enquiry;
  saving?: boolean;
}) {
  const query = useQuery({
    queryKey: ["files", enquiry.id],
    queryFn: () => receipts.list(enquiry.id),
  });
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <h2>Private receipts</h2>
      <p className="muted">
        PDF, PNG or JPEG · up to 5 MB. Record the payment separately from its
        receipt.
      </p>
      <form
        className="receipt-form"
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (saving || busy) return;
          const form = ev.currentTarget;
          const f = new FormData(form);
          const file = f.get("file");
          if (!(file instanceof File)) return;
          setBusy(true);
          setError("");
          try {
            await receipts.upload(
              enquiry.id,
              file,
              String(f.get("payment") || "") || undefined,
            );
            await client.invalidateQueries({ queryKey: ["files", enquiry.id] });
            form.reset();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Receipt file
          <input
            type="file"
            name="file"
            accept="application/pdf,image/png,image/jpeg"
            required
            disabled={saving || busy}
          />
        </label>
        <label>
          Link to payment
          <select name="payment" disabled={saving || busy}>
            <option value="">Enquiry only</option>
            {enquiry.payments.map((p) => (
              <option key={p.id} value={p.id}>
                {p.reference} ·{" "}
                {p.status === "reversed" ? "Reversed" : "Recorded"}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={busy || saving}>
          {busy ? "Uploading…" : "Upload private receipt"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {query.isPending ? (
        <p>Loading receipts…</p>
      ) : query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : query.data.length ? (
        query.data.map((f) => (
          <div className="payment-row" key={f.id}>
            <div>
              <strong>{f.name}</strong>
              <small>
                {Math.ceil(f.size / 1024)} KB ·{" "}
                {f.paymentId ? "Linked payment" : "Enquiry attachment"}
              </small>
            </div>
            <a
              className="button outline small"
              href={`/api/files/${f.id}`}
              download
            >
              Download privately
            </a>
          </div>
        ))
      ) : (
        <p className="micro">No receipts attached.</p>
      )}
    </div>
  );
}
