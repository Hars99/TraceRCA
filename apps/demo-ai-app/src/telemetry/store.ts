import { v4 as uuidv4 } from "uuid";
import type { TelemetryEvent, TelemetrySummary, EventType } from "./types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_EVENTS = parseInt(process.env.TELEMETRY_MAX_EVENTS ?? "5000", 10);

// ---------------------------------------------------------------------------
// Store — bounded array acting as a ring buffer (oldest evicted on overflow)
// ---------------------------------------------------------------------------

const store: TelemetryEvent[] = [];

export function append(
  fields: Omit<TelemetryEvent, "id" | "timestamp">
): TelemetryEvent {
  const event: TelemetryEvent = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...fields,
  };

  if (store.length >= MAX_EVENTS) {
    store.shift(); // evict oldest
  }
  store.push(event);

  return event;
}

export function getAll(): TelemetryEvent[] {
  return store.slice();
}

export function getByRequestId(requestId: string): TelemetryEvent[] {
  return store.filter((e) => e.requestId === requestId);
}

export function getByTraceId(traceId: string): TelemetryEvent[] {
  return store.filter((e) => e.traceId === traceId);
}

export function getSummary(): TelemetrySummary {
  let totalRequests = 0;
  let completedRequests = 0;
  let failedRequests = 0;
  let provider429Count = 0;
  let retryCount = 0;
  let fallbackCount = 0;

  for (const e of store) {
    const t = e.type as EventType;
    if (t === "request.started") totalRequests++;
    else if (t === "request.completed") completedRequests++;
    else if (t === "request.failed") failedRequests++;
    else if (t === "provider.response" && e.status === 429) provider429Count++;
    else if (t === "router.retry_scheduled") retryCount++;
    else if (t === "router.fallback") fallbackCount++;
  }

  return {
    totalRequests,
    completedRequests,
    failedRequests,
    provider429Count,
    retryCount,
    fallbackCount,
  };
}
