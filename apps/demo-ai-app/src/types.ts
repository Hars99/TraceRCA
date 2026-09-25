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
