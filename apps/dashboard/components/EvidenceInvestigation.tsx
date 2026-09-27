import type { EvidenceRecord } from "../lib/types";
import { formatDate, formatNumber } from "../lib/format";
import { EmptyState, SectionHeading, SourceBadge } from "./ui";

const metricNames = { prompt: "tracerca_llm_prompt_tokens", duration: "tracerca_llm_request_duration_seconds", completion: "tracerca_llm_completion_tokens" } as const;
type Workload = "normal" | "high-context";
type Comparison = Record<Workload, Record<keyof typeof metricNames, EvidenceRecord>>;

function runIdOf(item: EvidenceRecord): string | undefined { return item.correlation?.keys?.runId ?? item.attributes?.prometheusLabels?.run_id; }
function workloadOf(item: EvidenceRecord): string | undefined { return item.attributes?.prometheusLabels?.workload; }
function metricFor(records: EvidenceRecord[], metric: string, workload: Workload): EvidenceRecord | undefined { return records.filter((item) => item.kind === "metric" && item.metric === metric && workloadOf(item) === workload).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]; }

export function selectLatestCompleteRun(evidence: EvidenceRecord[]): { runId: string; records: EvidenceRecord[]; comparison: Comparison } | null {
  const groups = new Map<string, EvidenceRecord[]>();
  for (const item of evidence) { const runId = runIdOf(item); if (runId) groups.set(runId, [...(groups.get(runId) ?? []), item]); }
  const ordered = Array.from(groups.entries()).sort(([, a], [, b]) => (b.map((item: EvidenceRecord) => item.timestamp).sort().at(-1) ?? "").localeCompare(a.map((item: EvidenceRecord) => item.timestamp).sort().at(-1) ?? ""));
  for (const [runId, records] of ordered) {
    const normal = { prompt: metricFor(records, metricNames.prompt, "normal"), duration: metricFor(records, metricNames.duration, "normal"), completion: metricFor(records, metricNames.completion, "normal") };
    const high = { prompt: metricFor(records, metricNames.prompt, "high-context"), duration: metricFor(records, metricNames.duration, "high-context"), completion: metricFor(records, metricNames.completion, "high-context") };
    if (normal.prompt && normal.duration && normal.completion && high.prompt && high.duration && high.completion) return { runId, records, comparison: { normal: normal as Comparison["normal"], "high-context": high as Comparison["high-context"] } };
  }
  return null;
}

function value(item: EvidenceRecord): number { return typeof item.value === "number" ? item.value : 0; }
function seconds(item: EvidenceRecord): string { return `${value(item).toFixed(3)}s`; }
function EvidenceGroup({ title, items }: { title: string; items: EvidenceRecord[] }) {
  return <section className="evidence-group"><div className="evidence-group-title"><h3>{title}</h3><span>{items.length}</span></div>{items.length ? <div className="evidence-records">{items.map((item) => <article key={item.id}><time>{formatDate(item.timestamp)}</time><strong>{item.metric ?? item.eventType ?? item.entity ?? item.kind}</strong><span>{item.kind === "metric" ? `${formatNumber(item.value)}${item.unit ? ` ${item.unit}` : ""}` : item.kind === "event" ? (item.status ? `HTTP ${item.status}` : "Observed event") : `${String(item.before ?? "—")} → ${String(item.after ?? "—")}`}</span><small>{item.source.provider ?? item.source.category} · {item.correlation?.service ?? "unscoped"}{workloadOf(item) ? ` · ${workloadOf(item)}` : ""}</small></article>)}</div> : <p className="muted">No {title.toLowerCase()} for this run.</p>}</section>;
}

function BarChart({ title, normal, high, formatter }: { title: string; normal: number; high: number; formatter: (value: number) => string }) {
  const max = Math.max(normal, high, 1);
  return <article className="comparison-chart"><h3>{title}</h3>{[["Normal", normal], ["High context", high]] .map(([label, amount]) => <div className="bar-row" key={String(label)}><span>{label}</span><div className="bar-track"><i style={{ width: `${(Number(amount) / max) * 100}%` }} /></div><strong>{formatter(Number(amount))}</strong></div>)}</article>;
}

export function EvidenceInvestigation({ evidence }: { evidence: EvidenceRecord[] }) {
  const selected = selectLatestCompleteRun(evidence);
  if (!selected) return <EmptyState title="No run-correlated local LLM evidence found" detail="Insufficient run-correlated evidence for comparison." />;
  const normal = selected.comparison.normal;
  const high = selected.comparison["high-context"];
  const normalPrompt = value(normal.prompt), highPrompt = value(high.prompt), normalDuration = value(normal.duration), highDuration = value(high.duration);
  const model = selected.records.find((item) => item.correlation?.model)?.correlation?.model ?? "Not reported";
  const environment = selected.records.find((item) => item.correlation?.environment)?.correlation?.environment ?? "Not reported";
  const direction = highDuration > normalDuration ? "higher" : highDuration < normalDuration ? "lower" : "equal";
  const promptDirection = highPrompt > normalPrompt ? "larger" : highPrompt < normalPrompt ? "smaller" : "equal";

  return <>
    <section className="identity-grid llm-identity"><div><span>Source</span><strong>Prometheus</strong></div><div><span>Runtime</span><strong>Ollama</strong></div><div><span>Model</span><strong>{model}</strong></div><div><span>Service</span><strong>local-llm-demo</strong></div><div><span>Environment</span><strong>{environment}</strong></div><div><span>Run ID</span><code>{selected.runId}</code></div></section>

    <section className="workload-comparison"><article className="workload-card"><span className="eyebrow">Normal</span><strong>{formatNumber(normalPrompt)} <small>prompt tokens</small></strong><strong>{seconds(normal.duration)} <small>request duration</small></strong><strong>{formatNumber(value(normal.completion))} <small>completion tokens</small></strong></article><div className="versus">VS<span>same run</span></div><article className="workload-card high-workload"><span className="eyebrow">High context</span><strong>{formatNumber(highPrompt)} <small>prompt tokens</small></strong><strong>{seconds(high.duration)} <small>request duration</small></strong><strong>{formatNumber(value(high.completion))} <small>completion tokens</small></strong></article></section>

    <section className="chart-grid"><BarChart title="Prompt Tokens" normal={normalPrompt} high={highPrompt} formatter={(amount) => formatNumber(amount)} /><BarChart title="Request Duration" normal={normalDuration} high={highDuration} formatter={(amount) => `${amount.toFixed(3)}s`} /></section>

    <section className="panel rca-panel"><SectionHeading eyebrow="Bob-compatible structured reasoning" title="Trace RCA" action={<SourceBadge tone="warning">NOT YET VERIFIED</SourceBadge>} /><div className="rca-sections"><article className="rca-observed"><h3>Observed Evidence</h3><ul><li>Normal used {formatNumber(normalPrompt)} prompt tokens and completed in {seconds(normal.duration)}.</li><li>High context used {formatNumber(highPrompt)} prompt tokens and completed in {seconds(high.duration)}.</li><li>Both measurements use model {model} and run ID {selected.runId}.</li></ul></article><article><h3>Supported Findings</h3><p>The {promptDirection} high-context prompt coincided with {direction} measured request duration in this run. This is correlation, not proof of causation.</p></article><article className="rca-hypothesis"><h3>Hypotheses</h3><p>Input size may influence inference work, but output length, cache state, runtime load, and scheduling may also affect duration.</p></article><article className="rca-unsupported"><h3>Unsupported Conclusions</h3><p>GPU saturation, CPU bottleneck, queue overload, memory exhaustion, and an Ollama defect are not established by this evidence.</p></article><article><h3>Missing Evidence</h3><p>GPU/CPU utilization, memory pressure, queue depth, concurrency, cache state, and repeated comparable runs.</p></article><article><h3>Recommended Next Checks</h3><p>Repeat both workloads under controlled ordering and collect runtime-resource and concurrency signals.</p></article><article><h3>Potential Remediation</h3><p>Insufficient evidence to recommend a verified remediation.</p></article><article><h3>Verification Status</h3><p><b>NOT YET VERIFIED</b></p></article><article><h3>Confidence</h3><p><b>MEDIUM</b></p></article></div></section>

    <section className="panel normalized-panel"><SectionHeading eyebrow="Normalized evidence" title="Evidence records" action={<span className="section-count">{selected.records.length} records · run_id correlated</span>} /><div className="evidence-groups"><EvidenceGroup title="Events" items={selected.records.filter((item) => item.kind === "event")} /><EvidenceGroup title="Metrics" items={selected.records.filter((item) => item.kind === "metric")} /><EvidenceGroup title="Changes" items={selected.records.filter((item) => item.kind === "change")} /></div><details className="raw-evidence"><summary>Raw evidence</summary><pre>{JSON.stringify(selected.records, null, 2)}</pre></details></section>
  </>;
}
