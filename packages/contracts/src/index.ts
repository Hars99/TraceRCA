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
