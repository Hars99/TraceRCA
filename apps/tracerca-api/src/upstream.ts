// ---------------------------------------------------------------------------
// upstream.ts — reusable HTTP proxy helper for TraceRCA API facade
//
// Forwards requests to downstream services, preserving status codes and
// JSON bodies. Returns a structured error if the upstream is unreachable
// or times out. Never throws — always returns a ProxyResult.
// ---------------------------------------------------------------------------

const UPSTREAM_TIMEOUT_MS = parseInt(
  process.env.UPSTREAM_TIMEOUT_MS ?? "5000",
  10
);

const REPLAY_UPSTREAM_TIMEOUT_MS = parseInt(
  process.env.REPLAY_UPSTREAM_TIMEOUT_MS ?? "15000",
  10
);

export { REPLAY_UPSTREAM_TIMEOUT_MS };

export interface ProxyResult {
  status: number;
  body: unknown;
}

interface UpstreamErrorBody {
  error: string;
  service: string;
  message: string;
}

function errorBody(service: string, message: string): UpstreamErrorBody {
  return { error: "upstream_unavailable", service, message };
}

/**
 * GET a downstream URL and return its status + parsed JSON body.
 * Appends an optional query string (already serialised, e.g. "?limit=10").
 */
export async function proxyGet(
  service: string,
  url: string,
  query = ""
): Promise<ProxyResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(`${url}${query}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const body = await res.json();
    return { status: res.status, body };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `timed out after ${UPSTREAM_TIMEOUT_MS}ms`
          : err.message
        : String(err);
    return { status: 503, body: errorBody(service, message) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST a JSON body to a downstream URL and return its status + parsed JSON body.
 * Pass `options.timeoutMs` to override the default UPSTREAM_TIMEOUT_MS.
 */
export async function proxyPost(
  service: string,
  url: string,
  payload: unknown,
  options?: { timeoutMs?: number }
): Promise<ProxyResult> {
  const timeoutMs = options?.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await res.json();
    return { status: res.status, body };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `timed out after ${timeoutMs}ms`
          : err.message
        : String(err);
    return { status: 503, body: errorBody(service, message) };
  } finally {
    clearTimeout(timer);
  }
}
