import type {
  TelemetryEvent,
  IncidentSeverity,
  IncidentMetrics,
} from "./types";

// ---------------------------------------------------------------------------
// Detection result
// ---------------------------------------------------------------------------

export interface DetectionResult {
  triggered: boolean;
  severity: IncidentSeverity;
  trigger: string;
  summary: string;
  metrics: IncidentMetrics;
  evidence: string[];
}

// ---------------------------------------------------------------------------
// Compute metrics from a set of telemetry events for one request
// ---------------------------------------------------------------------------

function computeMetrics(events: TelemetryEvent[]): IncidentMetrics {
  let provider429Count = 0;
  let retryCount = 0;
  let fallbackCount = 0;
  let providerAAttempts = 0;
  let finalProvider = "unknown";
  let totalLatencyMs = 0;

  // Total latency = wall time from request.started to request.completed/failed
  const startEvent = events.find((e) => e.type === "request.started");
  const endEvent = events.find(
    (e) => e.type === "request.completed" || e.type === "request.failed"
  );
  if (startEvent && endEvent) {
    totalLatencyMs =
      new Date(endEvent.timestamp).getTime() -
      new Date(startEvent.timestamp).getTime();
  }

  for (const e of events) {
    if (e.type === "provider.response" && e.status === 429) provider429Count++;
    if (e.type === "router.retry_scheduled") retryCount++;
    if (e.type === "router.fallback") fallbackCount++;
    if (e.type === "provider.requested" && e.provider === "A") providerAAttempts++;
    if (
      (e.type === "request.completed" || e.type === "request.failed") &&
      e.provider
    ) {
      finalProvider = e.provider;
    }
  }

  return {
    totalLatencyMs,
    provider429Count,
    retryCount,
    fallbackCount,
    providerAAttempts,
    finalProvider,
  };
}

// ---------------------------------------------------------------------------
// Deterministic rule evaluation
// Rules (any one fires → incident):
//   R1: provider429Count >= 2
//   R2: retryCount >= 2
//   R3: fallbackUsed AND totalLatencyMs >= 3000
// ---------------------------------------------------------------------------

export function evaluate(events: TelemetryEvent[]): DetectionResult {
  const metrics = computeMetrics(events);
  const { provider429Count, retryCount, fallbackCount, totalLatencyMs, finalProvider, providerAAttempts } = metrics;

  const fallbackUsed = fallbackCount > 0;

  const r1 = provider429Count >= 2;
  const r2 = retryCount >= 2;
  const r3 = fallbackUsed && totalLatencyMs >= 3000;

  const triggered = r1 || r2 || r3;

  if (!triggered) {
    return {
      triggered: false,
      severity: "low",
      trigger: "none",
      summary: "",
      metrics,
      evidence: [],
    };
  }

  // Severity
  let severity: IncidentSeverity;
  if (fallbackUsed && provider429Count >= 4) {
    severity = "critical";
  } else if (fallbackUsed) {
    severity = "high";
  } else if (retryCount >= 2) {
    severity = "medium";
  } else {
    severity = "low";
  }

  // Trigger label
  const firedRules: string[] = [];
  if (r1) firedRules.push(`provider429Count=${provider429Count}`);
  if (r2) firedRules.push(`retryCount=${retryCount}`);
  if (r3) firedRules.push(`fallback+latency=${totalLatencyMs}ms`);
  const trigger = firedRules.join("; ");

  // Deterministic summary
  const summary =
    `Provider A returned ${provider429Count} HTTP 429 response(s). ` +
    `${retryCount} retry attempt(s) were scheduled before traffic fell back to ` +
    `Provider ${finalProvider}, increasing total request latency to ${totalLatencyMs}ms.`;

  // Evidence
  const evidence: string[] = [];
  if (r1) evidence.push(`Rule R1 fired: ${provider429Count} HTTP 429 responses from Provider A (threshold ≥ 2)`);
  if (r2) evidence.push(`Rule R2 fired: ${retryCount} retries scheduled (threshold ≥ 2)`);
  if (r3) evidence.push(`Rule R3 fired: fallback triggered with total latency ${totalLatencyMs}ms (threshold ≥ 3000ms)`);
  evidence.push(`Provider A attempts: ${providerAAttempts}`);
  evidence.push(`Final provider: ${finalProvider}`);

  return { triggered, severity, trigger, summary, metrics, evidence };
}
