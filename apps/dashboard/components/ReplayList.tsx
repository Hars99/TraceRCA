import Link from "next/link";
import { formatDate, formatMs, formatPercent } from "../lib/format";
import type { ReplayRecord } from "../lib/types";
import { EmptyState, VerificationBadge } from "./ui";

export function ReplayList({ replays }: { replays: ReplayRecord[] }) {
  if (replays.length === 0) return <EmptyState title="No replay records" detail="Verified remediation experiments will appear here after Bob runs them." />;
  return <div className="replay-list">{replays.map((replay) => <Link className="replay-row" href={`/replays/${encodeURIComponent(replay.id)}`} key={replay.id}><div><div className="replay-row-title"><span className="incident-id">{replay.id}</span><VerificationBadge verified={replay.verified} /></div><span className="replay-incident">{replay.incidentId ?? "Unlinked incident"} · {formatDate(replay.createdAt)}</span></div><div className="replay-row-metrics"><span><b>{formatMs(replay.baseline.totalLatencyMs)}</b><small>baseline</small></span><span><b>{formatMs(replay.candidate.totalLatencyMs)}</b><small>candidate</small></span><span className="replay-improvement"><b>{formatPercent(replay.comparison.latencyImprovementPercent)}</b><small>improvement</small></span><span className="row-arrow" aria-hidden="true">↗</span></div></Link>)}</div>;
}
