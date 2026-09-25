import { formatMs, formatNumber, formatPercent, signedMs } from "../lib/format";
import type { ReplayRecord, ReplayRunResult } from "../lib/types";
import { MetricCard, VerificationBadge } from "./ui";

function RunMetric({ label, value }: { label: string; value: string }) {
  return <div className="run-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function RunCard({ label, config, result, candidate }: { label: string; config: ReplayRecord["baselineConfig"]; result: ReplayRunResult; candidate?: boolean }) {
  return <article className={`run-card ${candidate ? "candidate-card" : "baseline-card"}`}><div className="run-card-header"><div><span className="eyebrow">{candidate ? "Controlled candidate" : "Original path"}</span><h3>{label}</h3></div><span className={`run-result ${result.success ? "success" : "failure"}`}>{result.success ? "SUCCESS" : "FAILED"}</span></div><div className="config-line"><span>maxRetries <b>{config.maxRetries}</b></span><span>retryDelayMs <b>{config.retryDelayMs}</b></span></div><div className="run-metrics"><RunMetric label="Total latency" value={formatMs(result.totalLatencyMs)} /><RunMetric label="Provider A attempts" value={formatNumber(result.providerAAttempts)} /><RunMetric label="HTTP 429s" value={formatNumber(result.provider429Count)} /><RunMetric label="Retries" value={formatNumber(result.retryCount)} /><RunMetric label="Fallbacks" value={formatNumber(result.fallbackCount)} /><RunMetric label="Final provider" value={result.finalProvider || "—"} /></div></article>;
}

export function ReplayComparison({ replay }: { replay: ReplayRecord }) {
  return <><div className="verification-hero"><div><span className="eyebrow">Replay decision</span><h2>{replay.verified ? "Remediation verified through controlled replay of the incident workload" : "Candidate did not verify"}</h2><p>Comparison is returned by the TraceRCA replay engine. The dashboard does not reinterpret verification.</p></div><VerificationBadge verified={replay.verified} /></div><div className="replay-run-grid"><RunCard label="Baseline" config={replay.baselineConfig} result={replay.baseline} /><RunCard label="Candidate" config={replay.candidateConfig} result={replay.candidate} candidate /></div><div className="comparison-grid"><MetricCard icon="↘" label="Latency improvement" value={formatPercent(replay.comparison.latencyImprovementPercent)} detail="candidate vs baseline" /><MetricCard icon="−" label="Retries reduced" value={formatNumber(replay.comparison.retriesReducedBy)} detail="retry events" /><MetricCard icon="−" label="Attempts reduced" value={formatNumber(replay.comparison.providerAAttemptsReducedBy)} detail="Provider A attempts" /><MetricCard icon="Δ" label="Latency delta" value={signedMs(replay.comparison.latencyDeltaMs)} detail="candidate minus baseline" /></div></>;
}
