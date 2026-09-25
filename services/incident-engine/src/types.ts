// Local mirror of packages/contracts incident + telemetry types.

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
  timeline: TelemetryEvent[];
}

export interface IngestPayload {
  requestId: string;
  traceId: string;
  events: TelemetryEvent[];
}
