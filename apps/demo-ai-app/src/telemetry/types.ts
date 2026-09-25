// Local mirror of packages/contracts telemetry types.
// Kept in sync with packages/contracts/src/index.ts.

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
