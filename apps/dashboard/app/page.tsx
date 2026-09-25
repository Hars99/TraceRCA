import Link from "next/link";
import { IncidentList } from "../components/IncidentList";
import { ReplayList } from "../components/ReplayList";
import { ErrorState, HealthPill, MetricCard, SectionHeading } from "../components/ui";
import { getHealth, getIncidents, getReplays, getTelemetrySummary } from "../lib/api";
import { formatDate, formatPercent } from "../lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [healthResult, incidentsResult, summaryResult, replaysResult] = await Promise.all([
    getHealth(),
    getIncidents(),
    getTelemetrySummary(),
    getReplays(),
  ]);

  const incidents = incidentsResult.data?.incidents ?? [];
  const replays = replaysResult.data?.replays ?? [];
  const summary = summaryResult.data;
  const latestVerifiedReplay = replays.find((replay) => replay.verified);

  return (
    <div className="page-shell">
      <section className="hero-section">
        <div>
          <span className="eyebrow">Operations / live signal</span>
          <h1>See the incident. Prove the fix.</h1>
          <p className="hero-copy">TraceRCA connects production evidence to a defensible root-cause chain and a measured remediation replay.</p>
        </div>
        <div className="health-stack">
          <HealthPill healthy={healthResult.data?.status === "ok"} label={healthResult.data?.status === "ok" ? "TraceRCA API healthy" : "TraceRCA API unavailable"} />
          <span className="health-time">{healthResult.data?.timestamp ? `last signal ${formatDate(healthResult.data.timestamp)}` : "waiting for API signal"}</span>
        </div>
      </section>

      <div className="story-rail" aria-label="TraceRCA workflow">
        {[
          ["01", "Production incident"],
          ["02", "Telemetry"],
          ["03", "Root cause"],
          ["04", "Remediation"],
          ["05", "Replay"],
          ["06", "Verified"],
        ].map(([number, label], index, steps) => (
          <div className="story-step-wrap" key={label}>
            <div className="story-step"><span>{number}</span><strong>{label}</strong></div>
            {index < steps.length - 1 ? <span className="story-arrow" aria-hidden="true">→</span> : null}
          </div>
        ))}
      </div>

      <section className="metric-grid" aria-label="TraceRCA key performance indicators">
        <MetricCard icon="◉" label="Open incidents" value={String(incidents.filter((incident) => incident.status === "open").length)} detail="active response queue" />
        <MetricCard icon="⌁" label="Total requests" value={summary ? String(summary.totalRequests) : "—"} detail="telemetry summary" />
        <MetricCard icon="!" label="HTTP 429 responses" value={summary ? String(summary.provider429Count) : "—"} detail="provider failures observed" />
        <MetricCard icon="↻" label="Retry events" value={summary ? String(summary.retryCount) : "—"} detail="router behavior" />
        <MetricCard icon="⇄" label="Fallbacks" value={summary ? String(summary.fallbackCount) : "—"} detail="recovery paths" />
        <MetricCard icon="↘" label="Latest verified improvement" value={latestVerifiedReplay ? formatPercent(latestVerifiedReplay.comparison.latencyImprovementPercent) : "—"} detail={latestVerifiedReplay ? latestVerifiedReplay.id : "no verified replay"} />
      </section>

      {healthResult.error ? <ErrorState title="Live API health unavailable" detail={healthResult.error} /> : null}
      {incidentsResult.error ? <ErrorState title="Incident feed unavailable" detail={incidentsResult.error} /> : null}
      {summaryResult.error ? <ErrorState title="Telemetry summary unavailable" detail={summaryResult.error} /> : null}

      <div className="dashboard-grid">
        <section className="panel panel-wide" id="incidents">
          <SectionHeading eyebrow="Production signal" title="Recent incidents" action={<span className="section-count">{incidents.length} records</span>} />
          <IncidentList incidents={incidents} />
        </section>

        <section className="panel" id="replays">
          <SectionHeading eyebrow="Measured change" title="Replay ledger" action={<span className="section-count">{replays.length} records</span>} />
          {replaysResult.error ? <ErrorState title="Replay feed unavailable" detail={replaysResult.error} /> : <ReplayList replays={replays} />}
        </section>

        <section className="panel bob-panel">
          <div className="bob-orbit" aria-hidden="true"><span>IBM</span><strong>Bob</strong></div>
          <div>
            <span className="eyebrow">Investigation layer</span>
            <h2>IBM Bob Investigation</h2>
            <p>Bob connects to TraceRCA through MCP, retrieves incident timelines and metrics, determines the trigger/amplifier/recovery chain, and can invoke isolated remediation replay.</p>
            <div className="command-list">
              <code>/tracerca-incident-investigation &lt;incident-id&gt;</code>
              <code>/tracerca-verified-remediation &lt;incident-id&gt;</code>
            </div>
          </div>
        </section>
      </div>

      <footer className="page-footer">
        <span>TraceRCA · evidence first, verification earned</span>
        <Link href="/">Refresh live data</Link>
      </footer>
    </div>
  );
}
