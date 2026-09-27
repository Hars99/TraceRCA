import { evidenceRepository } from "../../evidence";
import type { EvidenceMetric } from "../../evidence";

export interface PrometheusSyncQuery { metric: string; promql: string; }
interface PrometheusSample { metric: Record<string, string>; value: [number, string]; }

const prometheusUrl = () => (process.env.PROMETHEUS_URL ?? "http://localhost:9090").replace(/\/$/, "");

export async function syncPrometheusEvidence(queries: PrometheusSyncQuery[]): Promise<{ queried: number; ingested: number; evidenceIds: string[]; samples: number }> {
  if (!Array.isArray(queries) || queries.length === 0 || queries.length > 25 || queries.some((query) => !query || typeof query.metric !== "string" || !query.metric || typeof query.promql !== "string" || !query.promql)) throw new Error("queries must contain 1 to 25 metric/promql entries");
  const evidenceIds: string[] = []; let samples = 0;
  for (const query of queries) {
    const response = await fetch(`${prometheusUrl()}/api/v1/query?query=${encodeURIComponent(query.promql)}`);
    const body = await response.json() as { status?: string; error?: string; data?: { resultType?: string; result?: PrometheusSample[] } };
    if (!response.ok || body.status !== "success" || body.data?.resultType !== "vector" || !Array.isArray(body.data.result)) throw new Error(`Prometheus query failed for ${query.metric}: ${body.error ?? `HTTP ${response.status}`}`);
    if (body.data.result.length > 500) throw new Error(`Prometheus query for ${query.metric} exceeded 500 samples`);
    for (const sample of body.data.result) {
      const timestampMs = sample.value?.[0] * 1000; const value = Number(sample.value?.[1]);
      if (!Number.isFinite(timestampMs) || !Number.isFinite(value)) continue;
      samples += 1;
      const labels = sample.metric ?? {}; const timestamp = new Date(timestampMs).toISOString();
      const sourceRecordId = `${query.metric}|${JSON.stringify(labels)}|${sample.value[0]}`;
      const record: EvidenceMetric = {
        id: "", kind: "metric", timestamp,
        source: { category: "observability", provider: "prometheus", instance: prometheusUrl(), connector: "prometheus" },
        origin: { kind: "system", actor: "prometheus" }, assertion: "observed",
        provenance: { connector: "prometheus", sourceRecordId, collectedAt: "", originalTimestamp: timestamp, rawReference: query.promql },
        correlation: { service: labels.service ?? labels.job, environment: labels.environment ?? "development", ...(labels.model ? { model: labels.model } : {}), ...(labels.run_id ? { keys: { runId: labels.run_id } } : {}) },
        metric: query.metric, value, ...(labels.unit ? { unit: labels.unit } : {}), attributes: { prometheusLabels: labels, promql: query.promql },
      };
      const saved = evidenceRepository.save(record); evidenceIds.push(saved.evidence.id);
    }
  }
  return { queried: queries.length, ingested: evidenceIds.length, evidenceIds, samples };
}
