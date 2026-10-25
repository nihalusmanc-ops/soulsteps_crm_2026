import { ArrowUpRight, Inbox } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import type { ReactNode } from "react";

/** URL state keeps operational filters intact across reloads and back navigation. */
export function useViewParam(key: string, fallback = "") {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;
  const setValue = (next: string) =>
    setParams(
      (previous) => {
        const updated = new URLSearchParams(previous);
        if (!next || next === fallback) updated.delete(key);
        else updated.set(key, next);
        return updated;
      },
      { replace: true },
    );
  return [value, setValue] as const;
}

export function Metric({
  label,
  value,
  foot,
  to,
  warning = false,
}: {
  label: string;
  value: ReactNode;
  foot: string;
  to: string;
  warning?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`stat metric ${typeof value === "string" && value.includes("AED") ? "metric-money" : ""} ${warning ? "warning" : ""}`}
    >
      <span>
        {label}
        <ArrowUpRight size={16} aria-hidden="true" />
      </span>
      <strong>{value}</strong>
      <small>{foot}</small>
    </Link>
  );
}

export function ViewSwitch({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; count?: number }[];
}) {
  return (
    <div className="view-switch" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? "active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function LoadingWorkspace() {
  return (
    <div
      className="loading-workspace"
      role="status"
      aria-label="Loading workspace"
    >
      <span className="skeleton skeleton-title" />
      <div className="stats">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton skeleton-stat" />
        ))}
      </div>
      <div className="panel">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton-row" />
        ))}
      </div>
      <span className="sr-only">Loading your records…</span>
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={26} aria-hidden="true" />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
