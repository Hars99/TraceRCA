import type { ReplayRunResult, ReplayComparison } from "./types";

// ---------------------------------------------------------------------------
// Pure deterministic comparison — no AI
// ---------------------------------------------------------------------------

export function compare(
  baseline: ReplayRunResult,
  candidate: ReplayRunResult
): ReplayComparison {
  const latencyDeltaMs = candidate.totalLatencyMs - baseline.totalLatencyMs;
  const latencyImprovementPercent =
    baseline.totalLatencyMs > 0
      ? Math.round(((baseline.totalLatencyMs - candidate.totalLatencyMs) / baseline.totalLatencyMs) * 100)
      : 0;
  const retriesReducedBy = baseline.retryCount - candidate.retryCount;
  const providerAAttemptsReducedBy = baseline.providerAAttempts - candidate.providerAAttempts;

  return {
    latencyDeltaMs,
    latencyImprovementPercent,
    retriesReducedBy,
    providerAAttemptsReducedBy,
  };
}

// ---------------------------------------------------------------------------
// Verification rule — deterministic, no AI
//
// verified=true only when ALL of:
//   - baseline.success === true
//   - candidate.success === true
//   - baseline.finalProvider === "B"
//   - candidate.finalProvider === "B"
//   - candidate.totalLatencyMs < baseline.totalLatencyMs
//   - candidate.retryCount < baseline.retryCount
// ---------------------------------------------------------------------------

export function verify(
  baseline: ReplayRunResult,
  candidate: ReplayRunResult
): boolean {
  return (
    baseline.success === true &&
    candidate.success === true &&
    baseline.finalProvider === "B" &&
    candidate.finalProvider === "B" &&
    candidate.totalLatencyMs < baseline.totalLatencyMs &&
    candidate.retryCount < baseline.retryCount
  );
}
