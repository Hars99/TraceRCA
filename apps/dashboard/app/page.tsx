import Link from "next/link";
import { IncidentList } from "../components/IncidentList";
import { ReplayList } from "../components/ReplayList";
import { ErrorState, MetricCard, SectionHeading, SourceBadge } from "../components/ui";
import { getIncidents, getPlatformHealth, getReplays, queryEvidence } from "../lib/api";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [health, incidentsResult, replaysResult, evidenceResult] = await Promise.all([
    getPlatformHealth(), getIncidents(), getReplays(), queryEvidence({ limit: 500 }),
  ]);
  const incidents = incidentsResult.data?.incidents ?? [];
  const replays = replaysResult.data?.replays ?? [];
  const evidence = evidenceResult.data?.evidence ?? [];
  const verified = replays.filter((replay) => replay.verified);
  const sources = new Set(evidence.map((item) => `${item.source.category}:${item.source.provider ?? item.source.connector ?? "native"}`));
  const primaryIncident = incidents.find((incident) => incident.id === "INC-001") ?? incidents[0];

  return <div className="page-shell">
    <section className="hero-section"><div><span className="eyebrow">Evidence-grounded incident intelligence</span><h1>From observed signal to verified action.</h1><p className="hero-copy">Two investigations, one platform: deterministic incident verification and real local AI observability.</p></div><SourceBadge tone="real">LIVE EVIDENCE CONSOLE</SourceBadge></section>

    <section className="panel status-panel"><SectionHeading eyebrow="Platform status" title="Live services" /><div className="service-grid">{health.map((service) => <div className="service-status" key={service.name}><span className={`status-light ${service.state}`} /><div><strong>{service.name}</strong><span>{service.state === "healthy" ? "Healthy" : service.state === "unavailable" ? "Unavailable" : "Unknown"}</span></div></div>)}</div></section>

    <section className="metric-grid summary-grid" aria-label="Platform summary">
      <MetricCard icon="!" label="Active / recent incidents" value={String(incidents.length)} detail="returned by TraceRCA" />
      <MetricCard icon="E" label="Recent evidence records" value={evidenceResult.data ? String(evidenceResult.data.count) : "—"} detail="bounded live query" />
      <MetricCard icon="✓" label="Verified replays" value={String(verified.length)} detail="verified=true only" />
      <MetricCard icon="S" label="Connected evidence sources" value={evidenceResult.data ? String(sources.size) : "—"} detail="observed in evidence" />
    </section>

    {(incidentsResult.error || replaysResult.error || evidenceResult.error) ? <ErrorState title="Some live data is unavailable" detail={[incidentsResult.error, replaysResult.error, evidenceResult.error].filter(Boolean).join(" · ")} /> : null}

    <section className="demo-grid" id="investigations">
      <article className="demo-card"><div className="demo-card-top"><SourceBadge tone="verified">CONTROLLED + VERIFIED</SourceBadge><span>Story A</span></div><h2>Verified Incident Investigation</h2><p>Provider degradation, retries, fallback recovery, Bob-compatible RCA, and a measured remediation replay.</p><div className="story-mini"><span>HTTP 429</span><b>→</b><span>Retries</span><b>→</b><span>Fallback</span><b>→</b><span>VERIFIED</span></div>{primaryIncident ? <Link className="button primary-button" href={`/incidents/${encodeURIComponent(primaryIncident.id)}`}>View Incident</Link> : <span className="muted">No incidents available.</span>}</article>
      <article className="demo-card real-demo"><div className="demo-card-top"><SourceBadge tone="real">REAL OBSERVABILITY DATA</SourceBadge><span>Story B</span></div><h2>Real Local LLM Investigation</h2><p>Real Ollama workloads observed through Prometheus, normalized by TraceRCA, and compared within one run ID.</p><div className="story-mini"><span>Ollama</span><b>→</b><span>Prometheus</span><b>→</b><span>Evidence</span><b>→</b><span>RCA</span></div><Link className="button primary-button" href="/evidence/local-llm">View Evidence RCA</Link></article>
    </section>

    <div className="dashboard-grid compact-dashboard"><section className="panel panel-wide" id="incidents"><SectionHeading eyebrow="Controlled scenario" title="Recent incidents" action={<span className="section-count">{incidents.length} records</span>} /><IncidentList incidents={incidents} /></section><section className="panel" id="replays"><SectionHeading eyebrow="Measured verification" title="Replay ledger" action={<span className="section-count">{replays.length} records</span>} /><ReplayList replays={replays} /></section></div>
    <footer className="page-footer"><span>TraceRCA · observed facts, explicit hypotheses, earned verification</span><Link href="/">Refresh live data</Link></footer>
  </div>;
}
