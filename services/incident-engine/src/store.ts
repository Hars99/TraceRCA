import type { Incident } from "./types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_INCIDENTS = parseInt(process.env.INCIDENT_MAX_EVENTS ?? "1000", 10);

// ---------------------------------------------------------------------------
// Sequential ID counter  INC-001, INC-002, …
// ---------------------------------------------------------------------------

let counter = 0;

function nextId(): string {
  counter += 1;
  return `INC-${String(counter).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const store: Incident[] = [];

export function createIncident(incident: Omit<Incident, "id" | "createdAt" | "updatedAt">): Incident {
  const now = new Date().toISOString();
  const record: Incident = {
    id: nextId(),
    createdAt: now,
    updatedAt: now,
    ...incident,
  };

  if (store.length >= MAX_INCIDENTS) {
    store.shift();
  }
  store.push(record);

  return record;
}

export function listIncidents(): Incident[] {
  return store.slice().reverse(); // most recent first
}

export function getIncidentById(id: string): Incident | undefined {
  return store.find((i) => i.id === id);
}
