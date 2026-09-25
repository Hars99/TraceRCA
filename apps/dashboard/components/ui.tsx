import type { ReactNode } from "react";
import type { IncidentSeverity, IncidentStatus } from "../lib/types";

export function StatusBadge({ status }: { status: IncidentStatus | string }) {
  return <span className={`badge badge-status status-${status.toLowerCase()}`}>{status}</span>;
}

export function SeverityBadge({ severity }: { severity: IncidentSeverity | string }) {
  return <span className={`badge badge-severity severity-${severity.toLowerCase()}`}>{severity}</span>;
}

export function VerificationBadge({ verified }: { verified: boolean }) {
  return (
    <span className={`verification-badge ${verified ? "verified" : "not-verified"}`}>
      <span className="verification-dot" aria-hidden="true" />
      {verified ? "VERIFIED REMEDIATION" : "NOT VERIFIED"}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-card-topline">
        <span className="metric-icon" aria-hidden="true">{icon}</span>
        <span className="metric-label">{label}</span>
      </div>
      <strong className="metric-value">{value}</strong>
      {detail ? <span className="metric-detail">{detail}</span> : null}
    </article>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="state-card empty-state">
      <span className="state-mark" aria-hidden="true">○</span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

export function ErrorState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="state-card error-state">
      <span className="state-mark" aria-hidden="true">!</span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

export function LoadingState({ label = "Loading live TraceRCA data" }: { label?: string }) {
  return (
    <div className="state-card loading-state">
      <span className="loader" aria-hidden="true" />
      <strong>{label}</strong>
    </div>
  );
}

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function HealthPill({ healthy, label }: { healthy: boolean; label: string }) {
  return (
    <span className={`health-pill ${healthy ? "health-ok" : "health-error"}`}>
      <span className="health-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
