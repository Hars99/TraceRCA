import Link from "next/link";
import { IncidentTimeline, ObservedIncidentFlow } from "../../../components/IncidentTimeline";
import { ErrorState, MetricCard, SectionHeading, SeverityBadge, StatusBadge } from "../../../components/ui";
import { getIncident, getIncidentEvents, getIncidentMetrics } from "../../../lib/api";
import { formatDate, formatMs, formatNumber } from "../../../lib/format";

export const dynamic = "force-dynamic";

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [incidentResult, eventsResult, metricsResult] = await Promise.all([
    getIncident(id),
    getIncidentEvents(id),
    getIncidentMetrics(id),
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

  return (
    <div className="page-shell">
      <div className="breadcrumb"><Link href="/">Operations</Link><span>/</span><span>{incident.id}</span></div>
      <section className="detail-hero">
        <div>
          <span className="eyebrow">Incident investigation</span>
          <div className="title-line"><h1>{incident.id}</h1><SeverityBadge severity={incident.severity} /><StatusBadge status={incident.status} /></div>
          <p className="detail-summary">{incident.summary || "Incident summary unavailable"}</p>
        </div>
        <div className="detail-stamp"><span>Created</span><strong>{formatDate(incident.createdAt)}</strong></div>
      </section>

      <section className="identity-grid">
        <div><span>Request ID</span><code>{incident.requestId}</code></div>
        <div><span>Trace ID</span><code>{incident.traceId}</code></div>
        <div><span>Recorded trigger</span><strong>{incident.trigger || "Evidence unavailable"}</strong></div>
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

      <div className="detail-grid">
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
    </div>
  );
}
