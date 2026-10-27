import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LockKeyhole, CheckCircle2 } from "lucide-react";
import { session } from "./data/api";
import { Button } from "./components/ui/button";

export function AccountSecurity({ embedded = false }: { embedded?: boolean }) {
  const status = useQuery({
    queryKey: ["password-status"],
    queryFn: session.passwordStatus,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  return (
    <>
      {!embedded && (
        <div className="page-heading">
          <h1>Account security</h1>
        </div>
      )}
      <section className="panel account-security">
        <LockKeyhole size={24} />
        <h2>
          {status.data?.hasPassword
            ? "Change your password"
            : "Set your password"}
        </h2>
        <p className="muted">
          Use a unique passphrase of at least 15 characters.
        </p>
        {status.isError && (
          <p role="alert" className="notice">
            {status.error.message}
          </p>
        )}
        {error && (
          <p role="alert" className="error-banner">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="info-note">
            <CheckCircle2 size={18} />
            Your password is saved. Other sessions have been signed out.
          </p>
        )}
        {status.data && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              const form = event.currentTarget,
                fields = new FormData(form);
              const password = String(fields.get("password") || "");
              if (password !== fields.get("confirmation")) {
                setError("The passwords do not match.");
                return;
              }
              setBusy(true);
              setError("");
              setSaved(false);
              try {
                await session.setPassword(
                  password,
                  String(fields.get("current") || "") || undefined,
                );
                form.reset();
                await status.refetch();
                setSaved(true);
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Your password could not be saved.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {status.data.hasPassword && (
              <label>
                Current password
                <input
                  type="password"
                  name="current"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                />
              </label>
            )}
            <label>
              New password
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={15}
                maxLength={128}
                required
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                name="confirmation"
                autoComplete="new-password"
                minLength={15}
                maxLength={128}
                required
              />
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </Button>
          </form>
        )}
      </section>
    </>
  );
}
