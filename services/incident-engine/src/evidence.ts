import type { TelemetryEvent } from "./types";

export type EvidenceKind = "event" | "metric" | "change";
export type EvidenceSourceCategory = "application" | "llm" | "observability" | "runtime" | "database" | "deployment" | "repository" | "custom";
export type EvidenceOriginKind = "human" | "pipeline" | "agent" | "scheduled" | "system" | "unknown";
export type EvidenceAssertion = "confirmed" | "observed" | "inferred";

export interface EvidenceSource { category: EvidenceSourceCategory; provider?: string; instance?: string; connector?: string; }
export interface EvidenceOrigin { kind: EvidenceOriginKind; actor?: string; }
export interface EvidenceProvenance { connector?: string; sourceRecordId?: string; collectedAt: string; originalTimestamp?: string; rawReference?: string; idempotencyKey?: string; }
export interface EvidenceCorrelation { traceId?: string; requestId?: string; sessionId?: string; service?: string; environment?: string; deploymentId?: string; pod?: string; container?: string; host?: string; node?: string; model?: string; keys?: Record<string, string>; }
export interface EvidenceBase { id: string; kind: EvidenceKind; timestamp: string; source: EvidenceSource; origin: EvidenceOrigin; assertion: EvidenceAssertion; provenance: EvidenceProvenance; correlation?: EvidenceCorrelation; attributes?: Record<string, unknown>; }
export interface EvidenceEvent extends EvidenceBase { kind: "event"; eventType: string; status?: number; }
export interface EvidenceMetric extends EvidenceBase { kind: "metric"; metric: string; value: number; unit?: string; }
export interface EvidenceChange extends EvidenceBase { kind: "change"; changeType: string; entity: string; before?: unknown; after?: unknown; }
export type Evidence = EvidenceEvent | EvidenceMetric | EvidenceChange;
export interface EvidenceRef { id: string; kind: EvidenceKind; }

export interface EvidenceQuery {
  kinds?: EvidenceKind[]; startTime?: string; endTime?: string; source?: { category?: EvidenceSourceCategory; provider?: string };
  service?: string; environment?: string; traceId?: string; requestId?: string; eventType?: string; metric?: string; limit?: number;
}

const categories: EvidenceSourceCategory[] = ["application", "llm", "observability", "runtime", "database", "deployment", "repository", "custom"];
const origins: EvidenceOriginKind[] = ["human", "pipeline", "agent", "scheduled", "system", "unknown"];
const assertions: EvidenceAssertion[] = ["confirmed", "observed", "inferred"];
const kinds: EvidenceKind[] = ["event", "metric", "change"];
let evidenceCounter = 0;

function isObject(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isIsoDate(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function optionalString(value: unknown): boolean { return value === undefined || typeof value === "string"; }

export function validateEvidence(input: unknown, expectedKind: EvidenceKind): string | undefined {
  if (!isObject(input) || input.kind !== expectedKind || !isIsoDate(input.timestamp)) return "kind and ISO-8601 timestamp are required";
  if (!isObject(input.source) || typeof input.source.category !== "string" || !categories.includes(input.source.category as EvidenceSourceCategory)) return "source.category is invalid";
  if (!isObject(input.origin) || typeof input.origin.kind !== "string" || !origins.includes(input.origin.kind as EvidenceOriginKind)) return "origin.kind is invalid";
  if (typeof input.assertion !== "string" || !assertions.includes(input.assertion as EvidenceAssertion)) return "assertion is invalid";
  if (!isObject(input.provenance) || (input.provenance.originalTimestamp !== undefined && !isIsoDate(input.provenance.originalTimestamp))) return "provenance.originalTimestamp must be ISO-8601 when supplied";
  if (![input.source.provider, input.source.instance, input.source.connector, input.origin.actor, input.provenance.connector, input.provenance.sourceRecordId, input.provenance.rawReference].every(optionalString)) return "source, origin, and provenance string fields are invalid";
  if (expectedKind === "event" && (typeof input.eventType !== "string" || input.eventType.length === 0 || (input.status !== undefined && typeof input.status !== "number"))) return "eventType is required and status must be numeric when supplied";
  if (expectedKind === "metric" && (typeof input.metric !== "string" || input.metric.length === 0 || typeof input.value !== "number" || !Number.isFinite(input.value) || !optionalString(input.unit))) return "metric, finite numeric value, and optional unit are required";
  if (expectedKind === "change" && (typeof input.changeType !== "string" || input.changeType.length === 0 || typeof input.entity !== "string" || input.entity.length === 0)) return "changeType and entity are required";
  return undefined;
}

export function validateEvidenceQuery(input: unknown): string | undefined {
  if (!isObject(input)) return "query body must be an object";
  if (input.kinds !== undefined && (!Array.isArray(input.kinds) || !input.kinds.every((kind) => typeof kind === "string" && kinds.includes(kind as EvidenceKind)))) return "kinds must contain valid evidence kinds";
  if (input.startTime !== undefined && !isIsoDate(input.startTime)) return "startTime must be ISO-8601";
  if (input.endTime !== undefined && !isIsoDate(input.endTime)) return "endTime must be ISO-8601";
  if (input.startTime !== undefined && input.endTime !== undefined && String(input.startTime) > String(input.endTime)) return "startTime must not be after endTime";
  if (input.source !== undefined && (!isObject(input.source) || (input.source.category !== undefined && (typeof input.source.category !== "string" || !categories.includes(input.source.category as EvidenceSourceCategory))) || !optionalString(input.source.provider))) return "source filter is invalid";
  if (![input.service, input.environment, input.traceId, input.requestId, input.eventType, input.metric].every(optionalString)) return "query string filters are invalid";
  if (input.limit !== undefined && (typeof input.limit !== "number" || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500)) return "limit must be an integer from 1 to 500";
  return undefined;
}

function nextId(): string { evidenceCounter += 1; return `EVD-${String(evidenceCounter).padStart(6, "0")}`; }
function idempotencyKey(source: EvidenceSource, provenance: EvidenceProvenance): string | undefined {
  if (!provenance.sourceRecordId) return undefined;
  return [provenance.connector ?? source.connector ?? "unknown", source.category, source.provider ?? "unknown", source.instance ?? "unknown", provenance.sourceRecordId].join("|");
}

export function normalizeEvidence(input: Evidence): Evidence {
  const provenance = { ...input.provenance, collectedAt: new Date().toISOString() };
  const key = idempotencyKey(input.source, provenance);
  if (key) provenance.idempotencyKey = key;
  return { ...input, id: nextId(), provenance } as Evidence;
}

export function telemetryEventToEvidenceEvent(event: TelemetryEvent): EvidenceEvent {
  const connector = "demo-ai-app-telemetry";
  return {
    id: "", kind: "event", timestamp: event.timestamp,
    source: { category: "application", ...(event.provider ? { provider: event.provider } : {}), connector },
    origin: { kind: "system", actor: event.source }, assertion: "observed",
    provenance: { connector, sourceRecordId: event.id, collectedAt: "", originalTimestamp: event.timestamp },
    correlation: { traceId: event.traceId, requestId: event.requestId, service: event.source },
    eventType: event.type, ...(event.status !== undefined ? { status: event.status } : {}),
    attributes: { ...(event.attributes ?? {}), ...(event.provider ? { provider: event.provider } : {}), ...(event.attempt !== undefined ? { attempt: event.attempt } : {}), ...(event.latencyMs !== undefined ? { latencyMs: event.latencyMs } : {}), ...(event.retryDelayMs !== undefined ? { retryDelayMs: event.retryDelayMs } : {}), ...(event.fallbackUsed !== undefined ? { fallbackUsed: event.fallbackUsed } : {}) },
  };
}

export interface EvidenceRepository { save(evidence: Evidence): { evidence: Evidence; duplicate: boolean }; getById(id: string): Evidence | undefined; query(query: EvidenceQuery): Evidence[]; }
export class InMemoryEvidenceRepository implements EvidenceRepository {
  private readonly records: Evidence[] = []; private readonly byKey = new Map<string, Evidence>();
  save(input: Evidence): { evidence: Evidence; duplicate: boolean } { const record = normalizeEvidence(input); const key = record.provenance.idempotencyKey; if (key) { const existing = this.byKey.get(key); if (existing) return { evidence: existing, duplicate: true }; this.byKey.set(key, record); } this.records.push(record); return { evidence: record, duplicate: false }; }
  getById(id: string): Evidence | undefined { return this.records.find((record) => record.id === id); }
  query(query: EvidenceQuery): Evidence[] { const limit = Math.min(Math.max(query.limit ?? 100, 1), 500); return this.records.filter((record) => {
    const c = record.correlation; if (query.kinds && !query.kinds.includes(record.kind)) return false;
    if (query.startTime && record.timestamp < query.startTime) return false; if (query.endTime && record.timestamp > query.endTime) return false;
    if (query.source?.category && record.source.category !== query.source.category) return false; if (query.source?.provider && record.source.provider !== query.source.provider) return false;
    if (query.service && c?.service !== query.service) return false; if (query.environment && c?.environment !== query.environment) return false;
    if (query.traceId && c?.traceId !== query.traceId) return false; if (query.requestId && c?.requestId !== query.requestId) return false;
    if (query.eventType && (record.kind !== "event" || record.eventType !== query.eventType)) return false; if (query.metric && (record.kind !== "metric" || record.metric !== query.metric)) return false;
    return true;
  }).sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(0, limit); }
}

export const evidenceRepository = new InMemoryEvidenceRepository();
