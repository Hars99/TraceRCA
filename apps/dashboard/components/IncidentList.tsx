import Link from "next/link";
import { formatDate } from "../lib/format";
import type { IncidentSummary } from "../lib/types";
import { EmptyState, SeverityBadge, StatusBadge } from "./ui";

export function IncidentList({ incidents }: { incidents: IncidentSummary[] }) {
  if (incidents.length === 0) return <EmptyState title="No incidents recorded" detail="Newly detected incidents will appear here from the live API." />;
  return <div className="incident-list">{incidents.map((incident) => <Link className="incident-row" href={`/incidents/${encodeURIComponent(incident.id)}`} key={incident.id}><div className="incident-row-main"><div className="incident-row-title"><span className="incident-id">{incident.id}</span><SeverityBadge severity={incident.severity} /><StatusBadge status={incident.status} /></div><strong>{incident.summary || "Incident summary unavailable"}</strong><span className="incident-trigger">Trigger · {incident.trigger || "Evidence unavailable"}</span></div><div className="incident-row-meta"><span>{formatDate(incident.createdAt)}</span><span className="mono">{incident.traceId}</span><span className="row-arrow" aria-hidden="true">↗</span></div></Link>)}</div>;
}
