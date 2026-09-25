import type {
  ApiHealth,
  ApiResult,
  EventsResponse,
  IncidentMetrics,
  IncidentRecord,
  IncidentSummary,
  ListResponse,
  ReplayRecord,
  TelemetrySummary,
} from "./types";

const apiBaseUrl = (process.env.TRACERCA_API_URL ?? "http://localhost:4004").replace(/\/$/, "");

async function getJson<T>(path: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      const message = typeof body?.error === "string" ? body.error : `TraceRCA API returned HTTP ${response.status}`;
      return { data: null, error: message };
    }

    return { data: body as T, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "TraceRCA API is unavailable",
    };
  }
}

export function getHealth(): Promise<ApiResult<ApiHealth>> {
  return getJson<ApiHealth>("/health");
}

export function getIncidents(): Promise<ApiResult<ListResponse<IncidentSummary>>> {
  return getJson<ListResponse<IncidentSummary>>("/api/incidents");
}

export function getIncident(id: string): Promise<ApiResult<IncidentRecord>> {
  return getJson<IncidentRecord>(`/api/incidents/${encodeURIComponent(id)}`);
}

export function getIncidentEvents(id: string): Promise<ApiResult<EventsResponse>> {
  return getJson<EventsResponse>(`/api/incidents/${encodeURIComponent(id)}/events`);
}

export function getIncidentMetrics(id: string): Promise<ApiResult<IncidentMetrics>> {
  return getJson<IncidentMetrics>(`/api/incidents/${encodeURIComponent(id)}/metrics`);
}

export function getTelemetrySummary(): Promise<ApiResult<TelemetrySummary>> {
  return getJson<TelemetrySummary>("/api/telemetry/summary");
}

export function getReplays(): Promise<ApiResult<ListResponse<ReplayRecord>>> {
  return getJson<ListResponse<ReplayRecord>>("/api/replays");
}

export function getReplay(id: string): Promise<ApiResult<ReplayRecord>> {
  return getJson<ReplayRecord>(`/api/replays/${encodeURIComponent(id)}`);
}
