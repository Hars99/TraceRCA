import type { RouterConfig, ReplayRunResult } from "./types";

const DEMO_APP_URL = process.env.DEMO_APP_URL ?? "http://localhost:3001";
const REPLAY_MESSAGE = process.env.REPLAY_MESSAGE ?? "replay-workload";

// ---------------------------------------------------------------------------
// Execute a single replay run against /replay-exec
// Uses the real provider-simulator — no mocking, no fake latency
// ---------------------------------------------------------------------------

export async function executeReplayRun(config: RouterConfig): Promise<ReplayRunResult> {
  const res = await fetch(`${DEMO_APP_URL}/replay-exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: REPLAY_MESSAGE,
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`replay-exec responded ${res.status}: ${text}`);
  }

  return res.json() as Promise<ReplayRunResult>;
}
