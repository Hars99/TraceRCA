import Link from "next/link";
import { ReplayComparison } from "../../../components/ReplayComparison";
import { ErrorState, SectionHeading, StatusBadge } from "../../../components/ui";
import { getReplay } from "../../../lib/api";
import { formatDate } from "../../../lib/format";

export const dynamic = "force-dynamic";

export default async function ReplayDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const replayResult = await getReplay(id);

  if (!replayResult.data) {
    return (
      <div className="page-shell page-centered">
        <ErrorState title={`Replay ${id} not found`} detail={replayResult.error ?? "The replay record was not returned by TraceRCA."} />
        <Link className="button secondary-button" href="/">Return to operations</Link>
      </div>
    );
  }

  const replay = replayResult.data;

  return (
    <div className="page-shell">
      <div className="breadcrumb"><Link href="/">Operations</Link><span>/</span><span>Replays</span><span>/</span><span>{replay.id}</span></div>
      <section className="detail-hero replay-hero">
        <div>
          <span className="eyebrow">Remediation replay</span>
          <div className="title-line"><h1>{replay.id}</h1><StatusBadge status={replay.status} /></div>
          <p className="detail-summary">A controlled baseline-versus-candidate experiment for {replay.incidentId ?? "an incident"}.</p>
        </div>
        <div className="detail-stamp"><span>Created</span><strong>{formatDate(replay.createdAt)}</strong></div>
      </section>

      <section className="identity-grid replay-identity">
        <div><span>Incident ID</span><Link href={replay.incidentId ? `/incidents/${encodeURIComponent(replay.incidentId)}` : "/"}>{replay.incidentId ?? "Unlinked"}</Link></div>
        <div><span>Baseline</span><code>{`maxRetries ${replay.baselineConfig.maxRetries} · ${replay.baselineConfig.retryDelayMs} ms delay`}</code></div>
        <div><span>Candidate</span><code>{`maxRetries ${replay.candidateConfig.maxRetries} · ${replay.candidateConfig.retryDelayMs} ms delay`}</code></div>
      </section>

      <section className="panel replay-panel">
        <SectionHeading eyebrow="Before / after" title="Verification comparison" />
        <ReplayComparison replay={replay} />
      </section>

      <footer className="page-footer"><span>Replay data is returned by the TraceRCA API.</span><Link href="/">Back to operations</Link></footer>
    </div>
  );
}
