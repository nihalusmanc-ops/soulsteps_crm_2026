import { Link } from "react-router-dom";
import {
  UserRound,
  ShieldCheck,
  SlidersHorizontal,
  ChevronRight,
} from "lucide-react";
import type { Identity } from "../shared/api";
import { useViewParam } from "./components/ui/workspace";
import { AccountSecurity } from "./AccountSecurity";
import { Management } from "./Management";

export function SettingsPage({ identity }: { identity: Identity }) {
  const [section, select] = useViewParam("section", "profile");
  const manager = identity.role === "manager";
  const primary = [
    ["profile", "Profile", UserRound],
    ["security", "Security", ShieldCheck],
  ] as const;
  const advanced = [
    ["health", "Health & backups"],
    ["audit", "Activity log"],
    ["release", "Release readiness"],
  ];
  const allowed = [
    "profile",
    "security",
    ...(manager
      ? ["settings", "imports", "meta", "health", "audit", "release"]
      : []),
  ];
  const current = allowed.includes(section) ? section : "profile";
  const item = (id: string, label: string) => (
    <button
      key={id}
      aria-current={current === id ? "page" : undefined}
      onClick={() => select(id)}
    >
      {label}
    </button>
  );
  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p className="muted">Your account and workspace.</p>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-navigation" aria-label="Settings sections">
          {primary.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={current === id ? "page" : undefined}
              onClick={() => select(id)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
          {manager && (
            <>
              <span className="settings-group-label">Workspace</span>
              <button
                aria-current={current === "settings" ? "page" : undefined}
                onClick={() => select("settings")}
              >
                <SlidersHorizontal size={17} />
                Workspace settings
              </button>
              {item("imports", "Import enquiries")}
              {item("meta", "Meta integration")}
              <details
                className="advanced-settings"
                open={advanced.some(([id]) => id === current) || undefined}
              >
                <summary>Advanced</summary>
                {advanced.map(([id, label]) => item(id, label))}
              </details>
            </>
          )}
        </nav>
        <div className="settings-body">
          {current === "profile" ? (
            <section
              className="settings-section"
              aria-labelledby="profile-title"
            >
              <h2 id="profile-title">Profile</h2>
              <p className="muted">Your Soulsteps account.</p>
              <div className="setting-row">
                <div>
                  <strong>Name</strong>
                  <p>{identity.name}</p>
                </div>
              </div>
              <div className="setting-row">
                <div>
                  <strong>Role</strong>
                  <p>{manager ? "Manager" : "Staff"}</p>
                </div>
                <span className="subtle">Managed by your workspace</span>
              </div>
              <div className="setting-row">
                <div>
                  <strong>Password</strong>
                  <p>Keep your account secure.</p>
                </div>
                <Link className="settings-row-link" to="/account/security">
                  Manage <ChevronRight size={16} />
                </Link>
              </div>
              <div className="setting-row">
                <div>
                  <strong>Timezone</strong>
                  <p>Asia/Dubai</p>
                </div>
              </div>
            </section>
          ) : current === "security" ? (
            <AccountSecurity embedded />
          ) : manager ? (
            <Management embedded />
          ) : null}
        </div>
      </div>
    </div>
  );
}
