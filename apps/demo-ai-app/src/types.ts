// Local types — kept in sync with packages/contracts/src/index.ts

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  reply: string;
  provider: string;
  fallbackUsed: boolean;
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

// Config supplied per-execution (used by /replay-exec and executeChat)
export interface RouterConfig {
  maxRetries: number;
  retryDelayMs: number;
}

// Structured result returned by executeChat() and /replay-exec
export interface ReplayChatResult {
  success: boolean;
  totalLatencyMs: number;
  providerAAttempts: number;
  provider429Count: number;
  retryCount: number;
  fallbackCount: number;
  finalProvider: string;
}

// Context passed into executeChat() — identifies the trace
export interface RequestContext {
  requestId: string;
  traceId: string;
  source: string;
}
