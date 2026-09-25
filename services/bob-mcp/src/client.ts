// ---------------------------------------------------------------------------
// client.ts — TraceRCA API HTTP client
//
// Single reusable client for all MCP tools.
// Handles base URL, timeouts, JSON GET/POST, and structured errors.
// Never throws — always returns ApiResult.
// ---------------------------------------------------------------------------

const BASE_URL = (process.env.TRACERCA_API_URL ?? "http://localhost:4004").replace(/\/$/, "");

const TIMEOUT_MS = parseInt(process.env.MCP_REQUEST_TIMEOUT_MS ?? "15000", 10);

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ApiOk<T = unknown> {
  ok: true;
  status: number;
  data: T;
}

export interface ApiError {
  ok: false;
  error: "tracerca_api_error" | "tracerca_api_timeout" | "tracerca_api_unreachable";
  status: number;
  message: string;
}

export type ApiResult<T = unknown> = ApiOk<T> | ApiError;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function timeoutError(ms: number): ApiError {
  return {
    ok: false,
    error: "tracerca_api_timeout",
    status: 504,
    message: `TraceRCA API did not respond within ${ms}ms`,
  };
}

function networkError(message: string): ApiError {
  return {
    ok: false,
    error: "tracerca_api_unreachable",
    status: 503,
    message,
  };
}

function apiError(status: number, body: unknown): ApiError {
  const message =
    body !== null &&
    typeof body === "object" &&
    "message" in body &&
    typeof (body as Record<string, unknown>).message === "string"
      ? (body as Record<string, unknown>).message as string
      : `HTTP ${status}`;
  return { ok: false, error: "tracerca_api_error", status, message };
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  payload?: unknown
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const init: RequestInit = {
      method,
      headers: {
        Accept: "application/json",
        ...(payload !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      signal: controller.signal,
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    };

    const res = await fetch(`${BASE_URL}${path}`, init);
    const data = (await res.json()) as T;

    if (!res.ok) {
      return apiError(res.status, data);
    }

    return { ok: true, status: res.status, data };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return timeoutError(TIMEOUT_MS);
    }
    return networkError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function apiGet<T = unknown>(path: string): Promise<ApiResult<T>> {
  return request<T>("GET", path);
}

export function apiPost<T = unknown>(path: string, payload: unknown): Promise<ApiResult<T>> {
  return request<T>("POST", path, payload);
}
