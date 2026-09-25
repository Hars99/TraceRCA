export type IncidentStatus = "open" | "investigating" | "resolved";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type EventType =
  | "request.started"
  | "provider.requested"
  | "provider.response"
  | "router.retry_scheduled"
  | "router.fallback"
  | "request.completed"
  | "request.failed";

export interface IncidentSummary {
  id: string;
  createdAt: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  trigger: string;
  requestId: string;
  traceId: string;
  summary: string;
}

export interface IncidentMetrics {
  totalLatencyMs: number;
  provider429Count: number;
  retryCount: number;
  fallbackCount: number;
  providerAAttempts: number;
  finalProvider: string;
}

export interface IncidentRecord extends IncidentSummary {
  updatedAt: string;
  metrics: IncidentMetrics;
  evidence: string[];
}

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

export interface ReplayConfig {
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

export interface ReplayRecord {
  id: string;
  createdAt: string;
  incidentId?: string;
  status: "completed" | "failed";
  baselineConfig: ReplayConfig;
  candidateConfig: ReplayConfig;
  baseline: ReplayRunResult;
  candidate: ReplayRunResult;
  comparison: ReplayComparison;
  verified: boolean;
}

export interface ApiHealth {
  status: string;
  service: string;
  timestamp: string;
}

export interface ListResponse<T> {
  count: number;
  incidents?: T[];
  replays?: T[];
}

export interface EventsResponse {
  count: number;
  events: TelemetryEvent[];
}

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
}
