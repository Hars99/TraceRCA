import type {
  ApiHealth,
  ApiResult,
  EventsResponse,
  IncidentMetrics,
  IncidentRecord,
  IncidentSummary,
  ListResponse,
  ReplayRecord,
  EvidenceResponse,
  IncidentEvidenceResponse,
  ServiceHealth,
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

async function postJson<T>(path: string, payload: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, { method: "POST", cache: "no-store", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) return { data: null, error: typeof body?.error === "string" ? body.error : `TraceRCA API returned HTTP ${response.status}` };
    return { data: body as T, error: null };
  } catch (error) { return { data: null, error: error instanceof Error ? error.message : "TraceRCA API is unavailable" }; }
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

export function queryEvidence(payload: Record<string, unknown>): Promise<ApiResult<EvidenceResponse>> {
  return postJson<EvidenceResponse>("/api/evidence/query", payload);
}

export function getIncidentEvidence(id: string): Promise<ApiResult<IncidentEvidenceResponse>> {
  return getJson<IncidentEvidenceResponse>(`/api/incidents/${encodeURIComponent(id)}/evidence`);
}

const serviceTargets = [
  ["TraceRCA API", apiBaseUrl, "/health"], ["Incident Engine", process.env.INCIDENT_ENGINE_URL ?? "http://incident-engine:4002", "/health"],
  ["Replay Engine", process.env.REPLAY_ENGINE_URL ?? "http://replay-engine:4003", "/health"], ["Prometheus", process.env.PROMETHEUS_URL ?? "http://prometheus:9090", "/-/ready"],
  ["Local LLM Demo", process.env.LOCAL_LLM_DEMO_URL ?? "http://local-llm-demo:3002", "/health"], ["Provider Simulator", process.env.PROVIDER_SIMULATOR_URL ?? "http://provider-simulator:4001", "/health"],
] as const;

export async function getPlatformHealth(): Promise<ServiceHealth[]> {
  return Promise.all(serviceTargets.map(async ([name, base, path]) => {
    try {
      const response = await fetch(`${base.replace(/\/$/, "")}${path}`, { cache: "no-store", signal: AbortSignal.timeout(2500) });
      if (!response.ok) return { name, state: "unavailable", detail: `HTTP ${response.status}` } as ServiceHealth;
      if (name === "Prometheus") return { name, state: "healthy" } as ServiceHealth;
      const body = await response.json().catch(() => null) as { status?: string } | null;
      return { name, state: body?.status === "ok" ? "healthy" : "unknown", detail: body?.status } as ServiceHealth;
    } catch { return { name, state: "unavailable" } as ServiceHealth; }
  }));
}
