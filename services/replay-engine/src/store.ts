import type { ReplayRecord, ReplayStatus, RouterConfig, ReplayRunResult, ReplayComparison } from "./types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_REPLAYS = parseInt(process.env.REPLAY_MAX_RECORDS ?? "500", 10);

// ---------------------------------------------------------------------------
// Sequential ID — RPL-001, RPL-002, …
// ---------------------------------------------------------------------------

let counter = 0;

function nextId(): string {
  counter += 1;
  return `RPL-${String(counter).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const store: ReplayRecord[] = [];

export function createReplay(fields: {
  incidentId?: string;
  status: ReplayStatus;
  baselineConfig: RouterConfig;
  candidateConfig: RouterConfig;
  baseline: ReplayRunResult;
  candidate: ReplayRunResult;
  comparison: ReplayComparison;
  verified: boolean;
}): ReplayRecord {
  const record: ReplayRecord = {
    id: nextId(),
    createdAt: new Date().toISOString(),
    ...fields,
  };

  if (store.length >= MAX_REPLAYS) {
    store.shift();
  }
  store.push(record);

  return record;
}

export function listReplays(): ReplayRecord[] {
  return store.slice().reverse(); // most recent first
}

export function getReplayById(id: string): ReplayRecord | undefined {
  return store.find((r) => r.id === id);
}
