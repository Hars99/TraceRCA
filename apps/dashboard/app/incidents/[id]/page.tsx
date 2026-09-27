import Link from "next/link";
import { IncidentTimeline, ObservedIncidentFlow } from "../../../components/IncidentTimeline";
import { ErrorState, MetricCard, SectionHeading, SeverityBadge, SourceBadge, StatusBadge, VerificationBadge } from "../../../components/ui";
import { getIncident, getIncidentEvidence, getIncidentEvents, getIncidentMetrics, getReplays } from "../../../lib/api";
import { formatDate, formatMs, formatNumber, formatPercent } from "../../../lib/format";

export const dynamic = "force-dynamic";

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [incidentResult, eventsResult, metricsResult, evidenceResult, replaysResult] = await Promise.all([
    getIncident(id),
    getIncidentEvents(id),
    getIncidentMetrics(id),
    getIncidentEvidence(id),
    getReplays(),
  ]);

  if (!incidentResult.data) {
    return (
      <div className="page-shell page-centered">
        <ErrorState title={`Incident ${id} not found`} detail={incidentResult.error ?? "The incident record was not returned by TraceRCA."} />
        <Link className="button secondary-button" href="/">Return to operations</Link>
      </div>
    );
  }

  const incident = incidentResult.data;
  const events = eventsResult.data?.events ?? [];
  const metrics = metricsResult.data ?? incident.metrics;
  const normalizedEvidence = evidenceResult.data?.evidence ?? [];
  const replay = (replaysResult.data?.replays ?? []).filter((item) => item.incidentId === incident.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const service = normalizedEvidence.find((item) => item.correlation?.service)?.correlation?.service ?? "Not established";
  const retryCount = metrics?.retryCount ?? events.filter((event) => event.type === "router.retry_scheduled").length;
  const failedProvider = events.find((event) => event.type === "provider.response" && typeof event.status === "number" && event.status >= 400)?.provider;

  return (
    <div className="page-shell">
      <div className="breadcrumb"><Link href="/">Operations</Link><span>/</span><span>{incident.id}</span></div>
      <section className="detail-hero">
        <div>
          <span className="eyebrow">Verified incident investigation</span>
          <div className="title-line"><h1>{incident.id}</h1><SeverityBadge severity={incident.severity} /><StatusBadge status={incident.status} /></div>
          <p className="detail-summary">{incident.summary || "Incident summary unavailable"}</p>
        </div>
        <div className="detail-stamp"><span>Created</span><strong>{formatDate(incident.createdAt)}</strong></div>
      </section>

      <section className="identity-grid">
        <div><span>Affected service</span><strong>{service}</strong></div>
        <div><span>Trace ID</span><code>{incident.traceId}</code></div>
        <div><span>Data source</span><strong>TraceRCA demo telemetry</strong></div>
      </section>

      <section className="incident-story-rail" aria-label="Incident outcome summary">
        <div><span>Trigger</span><strong>{metrics?.provider429Count ?? "—"} × HTTP 429</strong></div><b>→</b>
        <div><span>Amplifier</span><strong>{retryCount} retries</strong></div><b>→</b>
        <div><span>Recovery</span><strong>Fallback to {metrics?.finalProvider || "—"}</strong></div><b>→</b>
        <div><span>Impact</span><strong>{formatMs(metrics?.totalLatencyMs)}</strong></div><b>→</b>
        <div className={replay?.verified ? "story-verified" : ""}><span>Remediation</span><strong>{replay?.verified ? "VERIFIED" : "NOT VERIFIED"}</strong></div>
      </section>

      {eventsResult.error ? <ErrorState title="Ordered events unavailable" detail={eventsResult.error} /> : null}
      {metricsResult.error ? <ErrorState title="Incident metrics unavailable" detail={metricsResult.error} /> : null}

      <section className="metric-grid detail-metrics">
        <MetricCard icon="◷" label="Total latency" value={formatMs(metrics?.totalLatencyMs)} detail="request wall time" />
        <MetricCard icon="A" label="Provider A attempts" value={formatNumber(metrics?.providerAAttempts)} detail="primary path" />
        <MetricCard icon="!" label="HTTP 429 count" value={formatNumber(metrics?.provider429Count)} detail="returned responses" />
        <MetricCard icon="↻" label="Retries" value={formatNumber(metrics?.retryCount)} detail="router events" />
        <MetricCard icon="⇄" label="Fallback count" value={formatNumber(metrics?.fallbackCount)} detail="recovery transitions" />
        <MetricCard icon="✓" label="Final provider" value={metrics?.finalProvider || "—"} detail="completed response" />
      </section>

      <section className="panel rca-panel incident-rca-panel">
        <SectionHeading eyebrow="Evidence-grounded reasoning" title="Trace RCA" action={<SourceBadge tone="neutral">NORMALIZED INCIDENT EVIDENCE</SourceBadge>} />
        <div className="rca-grid">
          <article><span>Trigger</span><strong>{failedProvider && metrics?.provider429Count ? `Provider ${failedProvider} returned HTTP 429 ${metrics.provider429Count} times` : incident.trigger || "Insufficient evidence"}</strong></article>
          <article><span>Amplifier</span><strong>{retryCount > 0 ? `${retryCount} observed retries delayed fallback` : "No retry amplifier established"}</strong></article>
          <article><span>Recovery</span><strong>{metrics?.fallbackCount && metrics.finalProvider ? `Fallback completed through Provider ${metrics.finalProvider}` : "Recovery evidence unavailable"}</strong></article>
          <article><span>Impact</span><strong>{metrics?.totalLatencyMs !== undefined ? `${formatMs(metrics.totalLatencyMs)} total request latency` : "Impact not measured"}</strong></article>
        </div>
      </section>

      <section className="panel verification-panel">
        <div className="verification-title"><div><span className="eyebrow">Remediation + replay</span><h2>{replay ? "Measured baseline and candidate" : "Replay verification not available"}</h2></div>{replay ? <VerificationBadge verified={replay.verified} /> : <SourceBadge tone="warning">NOT YET VERIFIED</SourceBadge>}</div>
        {replay ? <><div className="remediation-strip"><div><span>Baseline</span><strong>maxRetries = {replay.baselineConfig.maxRetries}</strong></div><div className="arrow-separator">→</div><div><span>Candidate</span><strong>maxRetries = {replay.candidateConfig.maxRetries}</strong></div></div><div className="verification-metrics"><div><span>Baseline latency</span><strong>{formatMs(replay.baseline.totalLatencyMs)}</strong></div><div><span>Candidate latency</span><strong>{formatMs(replay.candidate.totalLatencyMs)}</strong></div><div><span>Retries</span><strong>{replay.baseline.retryCount} → {replay.candidate.retryCount}</strong></div><div><span>Final provider</span><strong>{replay.candidate.finalProvider}</strong></div><div><span>Improvement</span><strong>{formatPercent(replay.comparison.latencyImprovementPercent)}</strong></div></div><Link className="button secondary-button" href={`/replays/${encodeURIComponent(replay.id)}`}>Open replay evidence</Link></> : <p className="muted">No replay record is linked to this incident. The dashboard will not infer verification.</p>}
      </section>

      <div className="detail-grid incident-detail-grid">
        <section className="panel timeline-panel">
          <SectionHeading eyebrow="Telemetry / ordered" title="Incident timeline" action={<span className="section-count">{events.length} events</span>} />
          <IncidentTimeline events={events} />
        </section>
        <aside className="detail-sidebar">
          <ObservedIncidentFlow events={events} />
          <section className="panel evidence-panel">
            <SectionHeading eyebrow="Detector record" title="Evidence" />
            {incident.evidence.length > 0 ? (
              <ul className="evidence-list">{incident.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
            ) : <p className="muted">No detector evidence was returned.</p>}
          </section>
          <section className="panel bob-panel compact-bob">
            <div className="bob-orbit" aria-hidden="true"><span>IBM</span><strong>Bob</strong></div>
            <div><span className="eyebrow">Reasoning layer</span><h2>MCP investigation ready</h2><p>Use Bob to connect the returned facts into a trigger, amplifier, recovery, and impact narrative.</p></div>
          </section>
        </aside>
      </div>

      <footer className="page-footer"><span>Observed incident data · deterministic replay verification</span><Link href="/">Back to overview</Link></footer>
    </div>
  );
}
