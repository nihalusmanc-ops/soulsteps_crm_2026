import { useState, type FormEvent } from "react";
import { ArrowRight, Compass, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Button } from "./components/ui/button";
import "./login.css";

export type LoginFields = { email: string; password: string; code: string };

/** Authentication stays in the caller; this view never stores credentials. */
export function LoginPage({
  method,
  codeSent = false,
  busy,
  error,
  onSubmit,
  onChangeEmail,
}: {
  method: "password" | "email-code";
  codeSent?: boolean;
  busy: boolean;
  error: string;
  onSubmit: (fields: LoginFields) => Promise<void>;
  onChangeEmail?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [visible, setVisible] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    try {
      await onSubmit({ email: email.trim(), password, code });
    } finally {
      setPassword("");
      setCode("");
    }
  }
  return (
    <div className="login-page">
      <aside className="login-brand-panel" aria-label="Soulsteps">
        <div className="login-wordmark">
          <Compass size={30} strokeWidth={1.7} />
          <span>
            soulsteps<small>CRM</small>
          </span>
        </div>
        <div className="login-brand-copy">
          <span className="login-kicker">YOUR TEAM. ONE WORKSPACE.</span>
          <h2>
            A clear next step
            <br />
            for every journey.
          </h2>
          <p>
            Enquiries, follow-ups and bookings.
            <br />
            Everything your team needs, together.
          </p>
        </div>
        <span className="login-brand-footer">
          Soulsteps · Travel with purpose
        </span>
      </aside>
      <main className="login-main" id="main-content">
        <div className="login-mobile-brand">
          <Compass size={25} />
          <strong>soulsteps</strong>
        </div>
        <section className="login-form-panel" aria-labelledby="login-title">
          <span className="login-lock">
            <LockKeyhole size={22} strokeWidth={1.7} />
          </span>
          <h1 id="login-title">
            {codeSent ? "Check your email" : "Welcome back"}
          </h1>
          <p className="login-description">
            {codeSent
              ? "Enter the sign-in code sent to your email."
              : "Sign in to your Soulsteps workspace."}
          </p>
          {error && (
            <div role="alert" className="login-error">
              {error}
            </div>
          )}
          <form onSubmit={submit} aria-busy={busy}>
            <label htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={codeSent}
              placeholder="you@example.com"
            />
            {method === "password" && (
              <>
                <label htmlFor="login-password">Password</label>
                <div className="login-password">
                  <input
                    id="login-password"
                    name="password"
                    type={visible ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    maxLength={1024}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={visible ? "Hide password" : "Show password"}
                    aria-pressed={visible}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </>
            )}
            {method === "email-code" && codeSent && (
              <>
                <label htmlFor="login-code">Sign-in code</label>
                <input
                  id="login-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={12}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </>
            )}
            <Button type="submit" disabled={busy}>
              {busy
                ? "Please wait…"
                : method === "email-code" && !codeSent
                  ? "Send sign-in code"
                  : "Sign in"}
              {!busy && <ArrowRight size={17} />}
            </Button>
            {codeSent && onChangeEmail && (
              <Button
                variant="ghost"
                type="button"
                disabled={busy}
                onClick={onChangeEmail}
              >
                Use a different email
              </Button>
            )}
          </form>
          <p className="login-help">
            Access is by invitation. Contact your workspace manager if you need
            help signing in.
          </p>
        </section>
        <footer className="login-footer">
          © {new Date().getFullYear()} Soulsteps
        </footer>
      </main>
    </div>
  );
}
