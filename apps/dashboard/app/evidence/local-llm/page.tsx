import Link from "next/link";
import { EvidenceInvestigation } from "../../../components/EvidenceInvestigation";
import { ErrorState, SourceBadge } from "../../../components/ui";
import { queryEvidence } from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function LocalLlmEvidencePage() {
  const result = await queryEvidence({ kinds: ["event", "metric", "change"], service: "local-llm-demo", source: { provider: "prometheus" }, limit: 500 });
  return <div className="page-shell"><div className="breadcrumb"><Link href="/">Overview</Link><span>/</span><span>Evidence</span><span>/</span><span>Local LLM</span></div><section className="detail-hero llm-hero"><div><span className="eyebrow">Evidence investigation</span><h1>Real Local LLM Investigation</h1><p className="detail-summary">Ollama request measurements observed by Prometheus and normalized into run-correlated TraceRCA evidence.</p></div><SourceBadge tone="real">REAL OBSERVABILITY DATA</SourceBadge></section>{result.error ? <ErrorState title="Prometheus evidence unavailable" detail={result.error} /> : <EvidenceInvestigation evidence={result.data?.evidence ?? []} />}<footer className="page-footer"><span>Source: Prometheus · Runtime: Ollama · Correlation: run_id</span><Link href="/">Back to overview</Link></footer></div>;
}
