export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  reply: string;
  provider: string;
  fallbackUsed: boolean;
}

export interface ProviderRequest {
  message: string;
}

export interface ProviderResponse {
  reply: string;
  provider: string;
}

export interface RequestLog {
  requestId: string;
  provider: string;
  attempt: number;
  status: number;
  latencyMs: number;
  fallbackUsed: boolean;
  timestamp: string;
  retryDelayMs?: number;
}

export type ProviderMode = "normal" | "degraded";

export interface AdminModeRequest {
  provider: "A" | "B";
  mode: ProviderMode;
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

export type EventType =
  | "request.started"
  | "provider.requested"
  | "provider.response"
  | "router.retry_scheduled"
  | "router.fallback"
  | "request.completed"
  | "request.failed";

export interface TelemetryEvent {
  id: string;
  timestamp: string;
  requestId: string;
  traceId: string;
  source: string;
  type: EventType;
  provider?: string;
  attempt?: number;
  status?: number;
  latencyMs?: number;
  retryDelayMs?: number;
  fallbackUsed?: boolean;
  attributes?: Record<string, unknown>;
}

export interface TelemetrySummary {
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  provider429Count: number;
  retryCount: number;
  fallbackCount: number;
}

// ---------------------------------------------------------------------------
// Normalized evidence
// ---------------------------------------------------------------------------

export type EvidenceKind = "event" | "metric" | "change";

export interface EvidenceSource {
  category: "application" | "llm" | "observability" | "runtime" | "database" | "deployment" | "repository" | "custom";
  provider?: string;
  instance?: string;
  connector?: string;
}

export interface EvidenceOrigin {
  kind: "human" | "pipeline" | "agent" | "scheduled" | "system" | "unknown";
  actor?: string;
}

export type EvidenceAssertion = "confirmed" | "observed" | "inferred";

export interface EvidenceProvenance {
  connector?: string;
  sourceRecordId?: string;
  collectedAt: string;
  originalTimestamp?: string;
  rawReference?: string;
  idempotencyKey?: string;
}

export interface EvidenceCorrelation {
  traceId?: string;
  requestId?: string;
  sessionId?: string;
  service?: string;
  environment?: string;
  deploymentId?: string;
  pod?: string;
  container?: string;
  host?: string;
  node?: string;
  model?: string;
  keys?: Record<string, string>;
}

export interface EvidenceBase {
  id: string;
  kind: EvidenceKind;
  timestamp: string;
  source: EvidenceSource;
  origin: EvidenceOrigin;
  assertion: EvidenceAssertion;
  provenance: EvidenceProvenance;
  correlation?: EvidenceCorrelation;
  attributes?: Record<string, unknown>;
}

export interface EvidenceEvent extends EvidenceBase {
  kind: "event";
  eventType: string;
  status?: number;
}

export interface EvidenceMetric extends EvidenceBase {
  kind: "metric";
  metric: string;
  value: number;
  unit?: string;
}

export interface EvidenceChange extends EvidenceBase {
  kind: "change";
  changeType: string;
  entity: string;
  before?: unknown;
  after?: unknown;
}

export type Evidence = EvidenceEvent | EvidenceMetric | EvidenceChange;

export interface EvidenceRef {
  id: string;
  kind: EvidenceKind;
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

export type IncidentStatus = "open" | "investigating" | "resolved";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export interface IncidentMetrics {
  totalLatencyMs: number;
  provider429Count: number;
  retryCount: number;
  fallbackCount: number;
  providerAAttempts: number;
  finalProvider: string;
}

export interface Incident {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  trigger: string;
  requestId: string;
  traceId: string;
  summary: string;
  metrics: IncidentMetrics;
  evidence: string[];
  evidenceRefs?: EvidenceRef[];
  timeline: TelemetryEvent[];
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export interface RouterConfig {
  maxRetries: number;
  retryDelayMs: number;
}

export interface ReplayRunResult {
  success: boolean;
  totalLatencyMs: number;
  providerAAttempts: number;
  provider429Count: number;
  retryCount: number;
  fallbackCount: number;
  finalProvider: string;
}

export interface ReplayComparison {
  latencyDeltaMs: number;
  latencyImprovementPercent: number;
  retriesReducedBy: number;
  providerAAttemptsReducedBy: number;
}

export type ReplayStatus = "completed" | "failed";

export interface ReplayRecord {
  id: string;
  createdAt: string;
  incidentId?: string;
  status: ReplayStatus;
  baselineConfig: RouterConfig;
  candidateConfig: RouterConfig;
  baseline: ReplayRunResult;
  candidate: ReplayRunResult;
  comparison: ReplayComparison;
  verified: boolean;
}

export interface ReplayRequest {
  baselineConfig: RouterConfig;
  candidateConfig: RouterConfig;
  incidentId?: string;
}
