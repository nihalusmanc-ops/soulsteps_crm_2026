import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronUp,
  LockKeyhole,
  LogOut,
  Settings,
  UserRound,
} from "lucide-react";
import type { Identity } from "../shared/api";

export function ProfileMenu({
  identity,
  onNavigate,
  onSignOut,
}: {
  identity: Identity;
  onNavigate: () => void;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLAnchorElement>(".profile-popover a")
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const close = () => {
    setOpen(false);
    onNavigate();
  };
  const initials = identity.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
  return (
    <div
      className="profile-disclosure"
      ref={root}
      onKeyDownCapture={(event) => {
        if (open && event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      {open && (
        <div
          className="profile-popover"
          id="profile-actions"
          aria-label="Account options"
        >
          <div className="profile-menu-heading">
            <strong>{identity.name}</strong>
            <small>{identity.role === "manager" ? "Manager" : "Staff"}</small>
          </div>
          <Link to="/settings" onClick={close}>
            <UserRound size={17} /> Profile
          </Link>
          <Link to="/account/security" onClick={close}>
            <LockKeyhole size={17} /> Account security
          </Link>
          {identity.role === "manager" && (
            <Link to="/settings?section=settings" onClick={close}>
              <Settings size={17} /> Workspace settings
            </Link>
          )}
          {identity.authMethod === "password" && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onSignOut();
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogOut size={17} />
              {busy ? "Signing out…" : "Sign out"}
            </button>
          )}
        </div>
      )}
      <button
        ref={trigger}
        className="profile-trigger"
        aria-label={`Account menu for ${identity.name}`}
        aria-expanded={open}
        aria-controls="profile-actions"
        onClick={() => setOpen(!open)}
      >
        <span className="avatar">{initials || "S"}</span>
        <span className="profile-trigger-copy">
          <strong>{identity.name}</strong>
          <small>{identity.role === "manager" ? "Manager" : "Staff"}</small>
        </span>
        <ChevronUp size={16} />
      </button>
    </div>
  );
}
