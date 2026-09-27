# Task 4 — Generic Evidence Model & Ingestion Layer Design

**Status:** Design-only. No files modified. No services changed.

**Revision notes (post-review, round 3 — FINAL):**
- Normalization happens at the telemetry ingestion boundary (`POST /ingest` in incident-engine), not after `createIncident()`. Every incoming telemetry batch produces evidence, including healthy/non-incident requests.
- `EvidenceRepository` implementation lives inside `services/incident-engine`. No circular HTTP call from incident-engine → tracerca-api.
- `tracerca-api` proxies the new `GET /api/evidence/*` query routes to incident-engine, matching the existing pattern for `/incidents` and `/replays`.
- `evidenceRefs` is populated only after evidence records are successfully stored.
- `EvidenceOrigin` split: `origin.kind` carries the initiator class (no `"inferred"` here); a separate `assertion` field carries epistemic status (`confirmed | observed | inferred`).
- Three evidence kinds only in Phase A: `event`, `metric`, `change`.
- MCP tools unchanged from round 2: `query_evidence`, `get_incident_evidence`, `get_metric_window`.
- Acceptance test added: ingests a synthetic `gpu.utilization` metric and a config change, queries both through the HTTP API and through Bob's `query_evidence` tool.

---

## Table of Contents

1. [Recommended Evidence Schemas](#1-recommended-evidence-schemas)
2. [Provenance Model](#2-provenance-model)
3. [Correlation Model](#3-correlation-model)
4. [Ingestion API Recommendation](#4-ingestion-api-recommendation)
5. [Repository / Storage Abstraction](#5-repository--storage-abstraction)
6. [Backward Compatibility Strategy](#6-backward-compatibility-strategy)
7. [Incident Evolution Strategy](#7-incident-evolution-strategy)
8. [Minimal Future Bob MCP Surface](#8-minimal-future-bob-mcp-surface)
9. [Current Demo Mapping](#9-current-demo-mapping)
10. [Local-Model Example Mapping](#10-local-model-example-mapping)
11. [Files to Change or Create](#11-files-to-change-or-create)
12. [Implementation Phases](#12-implementation-phases)
13. [Risks and Migration Concerns](#13-risks-and-migration-concerns)

---

## 1. Recommended Evidence Schemas

### 1.1 Critical Review of the Proposed Shapes

The proposed shapes in the task are a sound starting point but have several problems that must be corrected before adoption.

#### Issues with `EvidenceEvent` as proposed

| Issue | Detail |
|-------|--------|
| `type: string` is too loose | Any string can be assigned. Downstream code cannot safely switch on it. A `category` field that narrows the class of event is safer than an unguarded free-text type. Keep `type` as the specific discriminator but add a coarser `category`. |
| `traceId` and `requestId` are top-level optional fields | This creates a mixed provenance + correlation concern at the root level. They belong in a dedicated `correlation` sub-object so that all correlation keys live in one place and new keys can be added without schema churn. |
| No `severity` enumeration | `severity?: string` admits any value. An enumeration keeps reasoning deterministic. |
| `attributes` is correctly open-ended | Keep it. Do not try to enumerate every possible attribute. |

#### Issues with `EvidenceMetric` as proposed

| Issue | Detail |
|-------|--------|
| No `interval` or `aggregation` field | A single timestamp is fine for a point-in-time sample but many metrics (CPU over 1 minute) represent an aggregated window. Without an aggregation label, Bob cannot tell whether `value` is an instantaneous reading or an average. Add `aggregation?: "instant" | "avg" | "max" | "min" | "p95" | "p99" | "sum"`. |
| `dimensions` is correctly typed as `Record<string, string>` | Keep this. It maps naturally to Prometheus label sets and OpenTelemetry attributes. |
| No `interval` field | Add `intervalMs?: number` to record the window the metric covers. |

#### Issues with `EvidenceChange` as proposed

| Issue | Detail |
|-------|--------|
| `before` and `after` are `unknown` | This is intentional and correct for generic support. Keep them. |
| `changeType: string` is unguarded | Same problem as `type` in EvidenceEvent. A coarse `category` field alongside a free-text `changeType` is more queryable. |
| `automated: boolean` is too coarse | A boolean cannot represent the meaningful difference between a CI pipeline, a human operator, an autonomous agent, or a scheduled job. These carry different reliability and Bob should know which it is. Replace with `origin: EvidenceOrigin`. |
| `metadata` should be renamed | `metadata` is ambiguous. Call it `attributes` to match `EvidenceEvent` and reduce cognitive overhead. |

### 1.2 Corrected Evidence Schemas

```typescript
// ─── EvidenceSource ──────────────────────────────────────────────────────────
// See Section 1.3 below

// ─── EvidenceProvenance ──────────────────────────────────────────────────────
// See Section 2 below

// ─── EvidenceCorrelation ─────────────────────────────────────────────────────
// See Section 3 below

// ─── Severity Enumeration ────────────────────────────────────────────────────
type EvidenceSeverity = "info" | "warning" | "error" | "critical";

// ─── EvidenceEvent ───────────────────────────────────────────────────────────
interface EvidenceEvent {
  id: string;                         // UUID — generated by ingestion layer
  timestamp: string;                  // ISO 8601, original event time
  source: EvidenceSource;             // Structured source descriptor
  category: EvidenceEventCategory;   // Coarse class of event (see below)
  type: string;                       // Fine-grained type within category
  service?: string;                   // Logical service name
  severity?: EvidenceSeverity;
  correlation: EvidenceCorrelation;   // All correlation keys in one place
  provenance: EvidenceProvenance;     // Origin metadata
  attributes: Record<string, unknown>; // Arbitrary vendor-specific payload
}

type EvidenceEventCategory =
  | "http"          // HTTP request/response events (429, 503, 200)
  | "retry"         // Retry and backoff events
  | "fallback"      // Fallback routing decisions
  | "lifecycle"     // Request started / completed / failed
  | "deployment"    // Deployment events that are discrete (not config diff)
  | "model"         // LLM-specific events (load, unload, queue overflow)
  | "pod"           // Kubernetes pod restart, OOMKill
  | "database"      // Connection timeout, query error
  | "custom";       // Escape hatch for anything else

// ─── EvidenceMetric ──────────────────────────────────────────────────────────
interface EvidenceMetric {
  id: string;
  timestamp: string;                  // ISO 8601, start of measurement window
  source: EvidenceSource;
  metric: string;                     // Canonical metric name, e.g. "http.request.latency"
  value: number;
  unit?: string;                      // "ms", "percent", "bytes", "requests/s"
  service?: string;
  aggregation?: EvidenceMetricAggregation;
  intervalMs?: number;                // Duration the value covers; omit for instant samples
  dimensions?: Record<string, string>; // Prometheus-style label set
  correlation: EvidenceCorrelation;
  provenance: EvidenceProvenance;
}

type EvidenceMetricAggregation =
  | "instant"
  | "avg"
  | "max"
  | "min"
  | "p50"
  | "p95"
  | "p99"
  | "sum"
  | "count";

// ─── EvidenceOrigin ──────────────────────────────────────────────────────────
// Describes WHO or WHAT initiated a change (origin.kind) and the epistemic
// status of the record itself (origin.assertion).
// These are two independent axes — do not conflate them.
//
// origin.kind   answers: "who or what made this change?"
// origin.assertion answers: "how certain are we this record is accurate?"
//
// "inferred" is NOT a valid origin.kind — you cannot know the initiator
// of something you only inferred. Use origin.kind = "unknown" when the
// initiator cannot be determined, and origin.assertion = "inferred" to
// record that the change itself was reconstructed from indirect evidence.

interface EvidenceOrigin {
  kind: EvidenceOriginKind;         // Who/what made the change — required
  actor?: string;                   // Human-readable name: "ci-pipeline", "alice", "cron-job"
  assertion: EvidenceAssertion;     // How reliable is this change record — required
}

type EvidenceOriginKind =
  | "human"       // A person (manual deploy, config edit via UI/CLI)
  | "pipeline"    // A CI/CD pipeline or automation script
  | "agent"       // An autonomous software agent (AI-driven, self-healing)
  | "scheduled"   // A scheduled job or cron task
  | "system"      // The platform itself (autoscaler, K8s controller, OS)
  | "unknown";    // Initiator cannot be determined — use this, not "inferred"

type EvidenceAssertion =
  | "confirmed"   // Record came directly from the authoritative system (e.g. CI webhook, audit log)
  | "observed"    // Change detected by monitoring (e.g. config diff, metric delta)
  | "inferred";   // Change reconstructed from indirect evidence (e.g. latency jump implies deploy)

// ─── EvidenceChange ──────────────────────────────────────────────────────────
interface EvidenceChange {
  id: string;
  timestamp: string;                  // ISO 8601, when the change was applied
  source: EvidenceSource;
  category: EvidenceChangeCategory;  // Coarse class of change
  changeType: string;                 // Fine-grained label, e.g. "maxRetries_changed"
  entity: string;                     // What changed, e.g. "router/config", "prompt/v2"
  before?: unknown;                   // Previous value; omit if unknown
  after?: unknown;                    // New value; omit if unknown
  origin: EvidenceOrigin;             // Who/what made this change and how certain we are
  service?: string;
  correlation: EvidenceCorrelation;
  provenance: EvidenceProvenance;
  attributes?: Record<string, unknown>;
}

type EvidenceChangeCategory =
  | "config"         // Retry params, timeouts, feature flags
  | "deployment"     // Code deploy, image tag change, SHA change
  | "model"          // Prompt swap, model version change, context window change
  | "infrastructure" // K8s resource limits, node pool scaling
  | "environment"    // Env var changes
  | "custom";
```

### 1.3 Evidence Source Model

**Recommendation: Use the structured object form, not a flat string union.**

The string-union form (`"application" | "llm" | ...`) collapses three independent concerns into one value. It cannot represent "Provider A" vs "Provider B" as separate instances of the same category, and it cannot be extended without changing the type.

The object form separates three independently useful axes:

```typescript
interface EvidenceSource {
  category: EvidenceSourceCategory;  // Broad category (required)
  provider?: string;                  // Vendor or product name (optional)
  instance?: string;                  // Specific instance, region, or identifier (optional)
}

type EvidenceSourceCategory =
  | "application"    // Business application, microservice
  | "llm"            // Language model (Ollama, OpenAI, vLLM, Gemini)
  | "observability"  // Prometheus, Grafana, Datadog
  | "logging"        // Loki, Elasticsearch, Splunk
  | "tracing"        // Tempo, Jaeger, Zipkin
  | "runtime"        // Kubernetes, Docker, VM
  | "database"       // Postgres, MySQL, Redis
  | "deployment"     // CI/CD pipeline, GitOps
  | "repository"     // Git, source control
  | "custom";        // Anything not listed above
```

**Concrete examples:**

| Scenario | category | provider | instance |
|----------|----------|----------|----------|
| TraceRCA demo app | `application` | `demo-ai-app` | — |
| Provider A | `application` | `provider-a` | — |
| Ollama local | `llm` | `ollama` | `localhost:11434` |
| OpenAI | `llm` | `openai` | `gpt-4o` |
| Prometheus scrape | `observability` | `prometheus` | `cluster-prod` |
| Kubernetes | `runtime` | `kubernetes` | `namespace/prod` |
| Postgres | `database` | `postgres` | `primary-db` |

**Why this is safer than the string union:**
- New providers can be added without touching the type definition
- Queries can filter on `category` alone (all LLM evidence) or `category + provider` (only Ollama evidence)
- The reasoning layer receives enough context to explain its sources

---

## 2. Provenance Model

Every evidence item must retain enough information to answer "where did this claim come from?" without storing raw payloads inside the evidence object.

```typescript
interface EvidenceProvenance {
  connector: string;          // Which adapter produced this record, e.g. "telemetry-adapter"
  collectedAt: string;        // ISO 8601 — when the connector observed and recorded it
  sourceRecordId?: string;    // ID of the record in the originating system
                               // e.g. a TelemetryEvent UUID, a Loki log entry ID, a K8s event UID
  rawRef?: string;            // Optional URI pointer to the original record — NOT the payload
                               // e.g. "loki://query?selector={app='x'}&start=T1&end=T2"
}
```

**Design principles applied here:**

1. **`connector`** identifies the software that performed the translation. This is distinct from `source`, which identifies the originating system. Both fields are needed when debugging a bad normalization.

2. **`collectedAt` vs `timestamp`** — `timestamp` is when the event happened; `collectedAt` is when the adapter collected it. In pull-based systems this lag is itself a diagnostic signal.

3. **`sourceRecordId`** is the record's identity in the original system. It is **part of the idempotency key** but not sufficient on its own (see Section 4.2).

4. **`rawRef`** is a URI pointer, not the payload. A Loki log line can be 10 KB; storing thousands of raw payloads in evidence objects would exhaust memory. Store the retrieval address instead.

5. **No `rawPayload`** — explicitly excluded. Connectors must extract what they need into `attributes`.

### 2.1 Idempotency Key Design

**Problem with `sourceRecordId` alone:** Two different connectors for two different systems (e.g., a Prometheus adapter and a Loki adapter) could independently assign the same `sourceRecordId` string to completely different records. Deduplication on `sourceRecordId` alone would silently drop one of them.

**Revised deduplication key — all five components required:**

```
connector + source.category + source.provider + source.instance + sourceRecordId
```

Concatenated as a single string for lookup: `"telemetry-adapter|application|demo-ai-app||<uuid>"`.

If `sourceRecordId` is absent (the connector did not assign one), deduplication is skipped and the ingestion layer generates a fresh UUID for `id`. This is safe because anonymous items are assumed to be unique.

**In practice for the telemetry adapter:**
- `connector`: `"telemetry-adapter"`
- `source.category`: `"application"`
- `source.provider`: `"demo-ai-app"` (the `TelemetryEvent.source` field value)
- `source.instance`: `""` (not applicable in the current demo)
- `sourceRecordId`: the original `TelemetryEvent.id` (already a UUID)

This combination is globally unique within TraceRCA and guarantees that re-ingesting the same telemetry batch (e.g., after a connector restart) does not duplicate evidence.

---

## 3. Correlation Model

Not every source has a trace ID. The correlation model must be flexible enough to link evidence across systems even when only partial keys are available.

```typescript
interface EvidenceCorrelation {
  // Strong identity keys — used when available
  traceId?: string;         // OpenTelemetry / Jaeger trace ID
  requestId?: string;       // Application-level request UUID
  incidentId?: string;      // Links evidence directly to an incident

  // Logical grouping keys — used for time-window and service correlation
  service?: string;         // Canonical service name
  environment?: string;     // "production", "staging"
  deploymentId?: string;    // Deployment identifier (SHA, tag, pipeline run ID)

  // Infrastructure keys — used when trace IDs are unavailable
  host?: string;            // Hostname or node name
  pod?: string;             // Kubernetes pod name
  container?: string;       // Container name within a pod
  model?: string;           // LLM model identifier, e.g. "llama3:8b"

  // Flexible escape hatch — arbitrary key-value pairs
  labels?: Record<string, string>;
}
```

**How correlation works without a trace ID:**

The system does not require `traceId` for correlation. It uses a best-available strategy:

1. If `traceId` is present → group by `traceId` first
2. Else if `requestId` is present → group by `requestId`
3. Else group by `service + environment` within a time window
4. Infrastructure evidence (pod restarts, CPU spikes) correlates by `host/pod` and time proximity
5. Deployment changes correlate by `deploymentId` or time-range overlap with other evidence

**Time-window correlation** is intentionally left to the incident engine / reasoning layer. The evidence model does not embed "this event caused that metric" — it stores the raw evidence and lets the correlator decide. This avoids baking causal reasoning into the schema.

---

## 4. Ingestion API Recommendation

### 4.1 Comparison: Typed Endpoints vs Discriminated Union

**Option A — Separate endpoints per evidence type:**
```
POST /evidence/events
POST /evidence/metrics
POST /evidence/changes
```

**Option B — Single endpoint with discriminated union:**
```
POST /evidence
Body: { type: "event" | "metric" | "change", payload: … }
```

**Recommendation: Option A (separate endpoints).**

Rationale:
- Validation is simpler and more precise. A metric endpoint rejects an event payload at the route level without a runtime discriminator check.
- Clients (connectors) POST to one unambiguous endpoint without wrapping their payload.
- Route-level rate limiting and authentication can differ per type.
- Error messages are clearer: "POST /evidence/metrics returned 400: value must be a number" vs "POST /evidence returned 400: type=metric, value must be a number."
- A gateway can apply different size limits to events (typically small) vs raw change payloads (which can include large `before`/`after` diffs).

The tradeoff is three endpoints instead of one, but connectors are single-purpose and only call the relevant endpoint.

### 4.2 Recommended Ingestion API

All three endpoints share the same envelope:

```
POST /evidence/events
POST /evidence/metrics
POST /evidence/changes

Content-Type: application/json
```

**Request — single item:**
```json
{
  "item": { … EvidenceEvent | EvidenceMetric | EvidenceChange … }
}
```

**Request — batch:**
```json
{
  "items": [
    { … },
    { … }
  ]
}
```

Both `item` (singular) and `items` (array) are accepted. A request with `item` is equivalent to `items: [item]`. The response always returns a batch result.

**Response — success:**
```json
{
  "accepted": 3,
  "rejected": 1,
  "errors": [
    {
      "index": 2,
      "id": "provided-id-if-present",
      "reason": "value must be a finite number"
    }
  ]
}
```

**Batch size limit:** 500 items per request. Larger batches must be split by the connector. This limit keeps a single HTTP request under ~1 MB for typical evidence objects and bounds memory usage during validation.

**Duplicate / idempotency handling:**

The five-component idempotency key (see Section 2.1) is used for deduplication:
`connector + source.category + source.provider + source.instance + sourceRecordId`

If an item with the same composite key already exists in the repository, the submission is accepted (HTTP 200/207) but not stored again. This allows connectors to safely retry POST requests.

If `sourceRecordId` is absent, no deduplication is attempted and the item is always stored as a new record. Connectors that need idempotency must supply `sourceRecordId`.

**Validation rules:**
- `id` — if provided, must be a non-empty string; otherwise generated
- `timestamp` — required, must be a parseable ISO 8601 string
- `source.category` — required, must be a valid `EvidenceSourceCategory` value
- `metric` + `value` — required on EvidenceMetric; `value` must be a finite number
- `entity` + `changeType` — required on EvidenceChange
- `category` + `type` — required on EvidenceEvent
- `provenance.connector` — required on all types
- `provenance.collectedAt` — required on all types

**Error behavior on partial batches:** If some items in a batch fail validation, the valid items are still stored and the response reports which indices failed. The HTTP status code is `207 Multi-Status` for partial success. Full success returns `200 OK`. All items rejected returns `400 Bad Request`.

---

## 5. Repository / Storage Abstraction

### 5.1 Repository Interface (in `packages/contracts`)

Wire/data contracts live in `packages/contracts`. The `EvidenceRepository` interface is defined there so any package can depend on it without depending on the implementation.

```typescript
// packages/contracts/src/evidence.ts

interface EvidenceQuery {
  incidentId?: string;
  traceId?: string;
  requestId?: string;
  service?: string;
  sourceCategory?: EvidenceSourceCategory;
  startTime?: string;   // ISO 8601
  endTime?: string;     // ISO 8601
  limit?: number;
}

interface EvidenceRepository {
  // EvidenceEvent
  appendEvent(event: EvidenceEvent): Promise<void>;
  queryEvents(query: EvidenceQuery): Promise<EvidenceEvent[]>;
  getEvent(id: string): Promise<EvidenceEvent | undefined>;

  // EvidenceMetric
  appendMetric(metric: EvidenceMetric): Promise<void>;
  queryMetrics(query: EvidenceQuery): Promise<EvidenceMetric[]>;

  // EvidenceChange
  appendChange(change: EvidenceChange): Promise<void>;
  queryChanges(query: EvidenceQuery): Promise<EvidenceChange[]>;
}
```

### 5.2 Phase A Implementation: In-Memory (hosted inside incident-engine)

**Architecture decision:** The `InMemoryEvidenceRepository` and evidence route handlers live inside `services/incident-engine`, not inside `tracerca-api`.

**Why:** The normalization boundary is `POST /ingest` on the incident engine. That is where telemetry batches arrive. Placing the repository in the same process means:
- Evidence is stored synchronously in the same request-handling path as detection — no network hop, no fire-and-forget failure mode.
- `evidenceRefs` can be populated only after `appendEvent` succeeds, with certainty.
- No circular dependency: `tracerca-api` already depends on `incident-engine`. Putting the repo in `incident-engine` preserves the existing one-way dependency direction.

`tracerca-api` gains two new proxy routes that forward evidence queries to `incident-engine`, matching the exact pattern it already uses for `/incidents` and `/replays`.

```typescript
// services/incident-engine/src/evidence/repository.ts

class InMemoryEvidenceRepository implements EvidenceRepository {
  private events: EvidenceEvent[] = [];
  private metrics: EvidenceMetric[] = [];
  private changes: EvidenceChange[] = [];
  // Separate ring-buffer caps: events 50 000 / metrics 10 000 / changes 5 000
  // FIFO eviction on overflow — matches existing incident/telemetry store pattern
}
```

```typescript
// Phase B — no changes to callers or routes
class PostgresEvidenceRepository implements EvidenceRepository {
  // same interface, different backing store
}
```

### 5.3 Decoupling the Reasoning Layer

The ingest router and Bob MCP tools interact **only with the `EvidenceRepository` interface**. The concrete class is instantiated once at `incident-engine` startup:

```typescript
// services/incident-engine/src/index.ts
import { InMemoryEvidenceRepository } from "./evidence/repository.js";
const evidenceRepo: EvidenceRepository = new InMemoryEvidenceRepository();
// passed to the router via a factory or module-level singleton
```

Phase B extraction to a standalone service requires only:
1. Create new service, copy `repository.ts`
2. Move evidence route handlers out of `incident-engine`
3. Update the `tracerca-api` proxy target URL via one env var

No callers change because they all talk to `tracerca-api`.

---

## 6. Backward Compatibility Strategy

### 6.1 Decision: Adapter Pattern (Option A) — Keep TelemetryEvent

**Recommendation: Keep `TelemetryEvent` exactly as it is. Add a thin adapter layer that translates it into the new generic model.**

**Rationale:**

The current `TelemetryEvent` is embedded in:
- `packages/contracts/src/index.ts` — exported type
- `apps/demo-ai-app/src/telemetry/store.ts` — stored directly
- `services/incident-engine/src/detector.ts` — consumed by rule engine
- `services/incident-engine/src/router.ts` — ingest endpoint
- `services/bob-mcp/src/tools/incidents.ts` — returned to Bob
- `services/bob-mcp/src/tools/telemetry.ts` — queried by Bob

Replacing `TelemetryEvent` requires touching every one of these files. That is the highest-risk change during a hackathon. If any adapter is wrong, the entire demo breaks.

The adapter approach insulates all existing code:

```typescript
// packages/contracts/src/adapters/telemetry-to-evidence.ts

function telemetryEventToEvidenceEvent(t: TelemetryEvent): EvidenceEvent {
  return {
    id: t.id,
    timestamp: t.timestamp,
    source: {
      category: "application",
      provider: t.source,        // "demo-ai-app" or "replay-exec"
    },
    category: mapEventCategory(t.type),
    type: t.type,
    service: t.provider,         // "A" or "B" in the current demo
    severity: mapStatus(t.status),
    correlation: {
      requestId: t.requestId,
      traceId: t.traceId,
    },
    provenance: {
      connector: "telemetry-adapter",
      collectedAt: t.timestamp,
      sourceRecordId: t.id,      // original TelemetryEvent UUID — used in idempotency key
    },
    attributes: {
      attempt: t.attempt,
      status: t.status,
      latencyMs: t.latencyMs,
      retryDelayMs: t.retryDelayMs,
      fallbackUsed: t.fallbackUsed,
      ...(t.attributes ?? {}),
    },
  };
}
```

**Where the adapter runs:** inside `POST /ingest` on the incident-engine, at the very start of the handler — before `evaluate()` is called. This means every received telemetry batch produces evidence, including batches for requests that do not trigger an incident.

```
POST /ingest (incident-engine)
  1. Validate payload
  2. Sort events by timestamp
  3. ── NEW ── adapt each event → EvidenceEvent
  4. ── NEW ── await repo.appendEvent() for each (stores evidence, returns IDs)
  5. evaluate(sorted) → DetectionResult          ← existing, unchanged
  6. if !triggered: return 200 { incident: null }  ← existing, unchanged
  7. createIncident(…)                             ← existing, unchanged
  8. ── NEW ── incident.evidenceRefs = storedIds.map(id => ({ id, kind: "event" }))
  9. return 201 { incident, triggered: true }      ← existing, unchanged
```

Steps 3–4 execute synchronously. `evidenceRefs` is only set in step 8 after step 4 has confirmed all records are in the store.

### 6.2 Migration Risk Comparison

| Approach | Risk | Change Surface |
|----------|------|---------------|
| A: Keep TelemetryEvent + adapter | Low | Only new files and the adapter |
| B: Replace TelemetryEvent | High | 6+ existing files, both demo flow and MCP tools |

---

## 7. Incident Evolution Strategy

### 7.1 Decision: `EvidenceRef[]` instead of three separate ID arrays

**Previously proposed grouped model:**
```typescript
evidenceRefs?: {
  events: string[];
  metrics: string[];
  changes: string[];
}
```

**Problem with the grouped model:**
- Three separate arrays are harder to extend. Adding a fourth evidence type (e.g., `"span"`) requires changing the `Incident` interface again.
- The arrays only hold IDs. Bob must know which array to look in before it can fetch the item. If the wrong array is used or the arrays are inconsistently populated, items are silently unfindable.
- Sorting or merging all evidence by timestamp requires iterating all three arrays and re-keying by type.

**Revised model: `EvidenceRef[]` — a typed pointer array.**

```typescript
interface EvidenceRef {
  id: string;                             // ID of the evidence record in the repository
  kind: "event" | "metric" | "change";   // Which collection to look up
}
```

```typescript
interface Incident {
  // Existing fields — unchanged
  id: string;
  createdAt: string;
  updatedAt: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  trigger: string;
  requestId: string;
  traceId: string;
  summary: string;
  metrics: IncidentMetrics;
  evidence: string[];           // Existing string facts — KEEP
  timeline: TelemetryEvent[];   // Existing raw timeline — KEEP

  // New field — additive, optional, does not break existing clients
  evidenceRefs?: EvidenceRef[];
}
```

**Why `EvidenceRef[]` is better:**
- Extensible: adding a fourth kind (`"span"`, `"log"`) requires adding one value to the `kind` union, not a new array on `Incident`.
- Flat and sortable: the array is a single sequence. Bob can iterate it, fetch each item by kind+id, and assemble a chronological timeline without merging three separate lists.
- Self-describing: each pointer carries its own type, so Bob never has to guess which collection to query.
- Additive: the field is `optional`. Existing `Incident` consumers see no change. The incident engine populates it after creating each new incident.

**How the adapter populates it:**
The adapter runs at the top of `POST /ingest`, before `evaluate()`. For every telemetry batch (incident or not), `appendEvent` is called for each event. The returned IDs are saved. When an incident *is* created:

```typescript
// After createIncident() succeeds and evidenceRefs is available:
incident.evidenceRefs = storedIds.map(id => ({ id, kind: "event" as const }));
```

`evidenceRefs` is set only after `appendEvent` has returned without error. If any `appendEvent` call throws (e.g., due to a memory constraint), `evidenceRefs` is left unpopulated rather than pointing to IDs that do not exist in the store. Existing `Incident` consumers see no change — the field is `optional`.

Phase A populates only `kind: "event"` refs. Metric and change refs are added when future connectors start posting to the ingestion routes.

---

## 8. Minimal Future Bob MCP Surface

### 8.1 Design Principle

More MCP tools does not mean better reasoning. Bob reasons better when each tool returns rich, focused data. The risk of many overlapping tools is that Bob calls them redundantly or synthesizes contradictory partial results.

**Target: Three generic tools for Phase A.**

`get_related_changes` is deferred. It covers `query_evidence({ types: ["change"], startTime, endTime, service })` exactly. It will only be added if a concrete capability gap emerges during use — not speculatively.

### 8.2 Recommended MCP Tools (Phase A)

```
query_evidence
  Description: Query normalized evidence across all sources within a time window.
               Supports filtering by incident, service, source category, and evidence type.
  Input:
    startTime: string (ISO 8601, required)
    endTime: string (ISO 8601, required)
    incidentId?: string
    service?: string
    sourceCategory?: EvidenceSourceCategory
    types?: ("event" | "metric" | "change")[]  // omit to return all three
    limit?: number (default 100, max 500)
  Output:
    { events: EvidenceEvent[], metrics: EvidenceMetric[], changes: EvidenceChange[] }

  This is the primary discovery tool. Use it when the incident window is known
  but no specific metric or incident ID is available.

get_incident_evidence
  Description: Return the full incident record plus all associated normalized evidence
               (events, metrics, and changes linked by evidenceRefs).
  Input:
    id: string  (incident ID, e.g. INC-001)
  Output:
    { incident: Incident, events: EvidenceEvent[], metrics: EvidenceMetric[], changes: EvidenceChange[] }

  Use this as the first call when investigating a known incident. It replaces
  separate calls to get_incident and query_evidence.

get_metric_window
  Description: Return metric samples for a specific named metric within a time range.
  Input:
    metric: string        (canonical metric name, e.g. "request.latency")
    startTime: string
    endTime: string
    service?: string
    dimensions?: Record<string, string>
  Output:
    { metric: string, unit?: string, samples: EvidenceMetric[] }

  Use this when the metric name is already known from a previous query_evidence call.
```

### 8.3 Tools Intentionally Not Added in Phase A

| Tool | Reason deferred |
|------|----------------|
| `get_related_changes` | Covered entirely by `query_evidence` with `types: ["change"]` and a time range. Add only if a concrete gap is found. |
| `get_evidence_timeline` | Covered by `query_evidence` with time bounds |
| `get_llm_evidence` | Covered by `query_evidence` with `sourceCategory: "llm"` |
| `get_k8s_evidence` | Covered by `query_evidence` with `sourceCategory: "runtime"` |
| `search_evidence` | Full-text search; not needed at MVP; adds complexity |
| `correlate_evidence` | Correlation belongs in the incident engine, not in a Bob tool |

---

## 9. Current Demo Mapping

The following shows how the existing Provider A / Provider B scenario maps to the generic evidence model. This proves that no information is lost.

### 9.1 EvidenceEvent Examples

```json
// request.started event
{
  "id": "evt-001",
  "timestamp": "2025-01-15T10:23:45.100Z",
  "source": { "category": "application", "provider": "demo-ai-app" },
  "category": "lifecycle",
  "type": "request.started",
  "service": "router",
  "correlation": {
    "requestId": "UUID1",
    "traceId": "UUID1"
  },
  "provenance": {
    "connector": "telemetry-adapter",
    "collectedAt": "2025-01-15T10:23:45.100Z",
    "sourceRecordId": "UUID1-started"
  },
  "attributes": { "message": "How are you?" }
}

// provider.response — Provider A returns 429
{
  "id": "evt-003",
  "timestamp": "2025-01-15T10:23:45.110Z",
  "source": { "category": "application", "provider": "provider-a" },
  "category": "http",
  "type": "provider.response",
  "service": "provider-a",
  "severity": "warning",
  "correlation": {
    "requestId": "UUID1",
    "traceId": "UUID1"
  },
  "provenance": {
    "connector": "telemetry-adapter",
    "collectedAt": "2025-01-15T10:23:45.110Z"
  },
  "attributes": { "status": 429, "latencyMs": 5, "attempt": 1 }
}

// router.fallback event
{
  "id": "evt-013",
  "timestamp": "2025-01-15T10:23:47.295Z",
  "source": { "category": "application", "provider": "demo-ai-app" },
  "category": "fallback",
  "type": "router.fallback",
  "service": "router",
  "severity": "warning",
  "correlation": {
    "requestId": "UUID1",
    "traceId": "UUID1"
  },
  "provenance": {
    "connector": "telemetry-adapter",
    "collectedAt": "2025-01-15T10:23:47.295Z"
  },
  "attributes": { "fromProvider": "A", "toProvider": "B" }
}
```

### 9.2 EvidenceMetric Examples

```json
// Total end-to-end latency for the request
{
  "id": "met-001",
  "timestamp": "2025-01-15T10:23:48.805Z",
  "source": { "category": "application", "provider": "demo-ai-app" },
  "metric": "request.latency",
  "value": 3705,
  "unit": "ms",
  "service": "router",
  "aggregation": "instant",
  "correlation": {
    "requestId": "UUID1",
    "traceId": "UUID1"
  },
  "provenance": {
    "connector": "telemetry-adapter",
    "collectedAt": "2025-01-15T10:23:48.805Z"
  }
}

// Provider A response latency (each 429 response)
{
  "id": "met-002",
  "timestamp": "2025-01-15T10:23:45.110Z",
  "source": { "category": "application", "provider": "provider-a" },
  "metric": "provider.response.latency",
  "value": 5,
  "unit": "ms",
  "service": "provider-a",
  "aggregation": "instant",
  "dimensions": { "status": "429", "attempt": "1" },
  "correlation": { "requestId": "UUID1", "traceId": "UUID1" },
  "provenance": {
    "connector": "telemetry-adapter",
    "collectedAt": "2025-01-15T10:23:45.110Z"
  }
}
```

### 9.3 EvidenceChange Examples

```json
// The admin mode change that started the incident scenario
{
  "id": "chg-001",
  "timestamp": "2025-01-15T10:23:40.000Z",
  "source": { "category": "application", "provider": "provider-simulator" },
  "category": "config",
  "changeType": "provider_mode_changed",
  "entity": "provider-a/mode",
  "before": "normal",
  "after": "degraded",
  "actor": "demo-operator",
  "automated": false,
  "service": "provider-a",
  "correlation": { "environment": "demo" },
  "provenance": {
    "connector": "admin-change-adapter",
    "collectedAt": "2025-01-15T10:23:40.000Z",
    "sourceRecordId": "admin-mode-001"
  }
}
```

### 9.4 Correlation Proof

All three evidence types share `requestId: "UUID1"` and `traceId: "UUID1"`. A query of `query_evidence({ requestId: "UUID1" })` returns the complete picture: 16 events, 2 metrics, and 1 change. Bob can construct a full causal narrative from first principles.

### 9.5 What Bob Can and Cannot Conclude

**Bob MAY conclude:**
- Provider A returned HTTP 429 on 4 consecutive attempts (supported by 4 `http` category events)
- The fallback to Provider B succeeded (supported by `provider.response` event with `status: 200`)
- Total latency was 3705ms (supported by the `request.latency` metric)
- The degraded mode was activated 5 seconds before the incident (supported by the `chg-001` change event)

**Bob MUST NOT claim:**
- That Provider A is permanently down (only one incident window observed)
- That reducing retries will always improve latency (only one data point; no statistical basis)
- That the mode change "caused" the 429s unless the change event is present in evidence

---

## 10. Local-Model Example Mapping

This section shows how the Ollama/vLLM scenario maps to the generic evidence model.

### 10.1 EvidenceEvent Examples

```json
// Application sees latency increase
{
  "id": "evt-lm-001",
  "timestamp": "2025-01-15T14:05:30.000Z",
  "source": { "category": "application", "provider": "my-app" },
  "category": "http",
  "type": "llm.response.slow",
  "service": "my-app",
  "severity": "warning",
  "correlation": { "requestId": "REQ-2PM-001", "model": "llama3:70b" },
  "provenance": { "connector": "app-telemetry-adapter", "collectedAt": "2025-01-15T14:05:30.000Z" },
  "attributes": { "latencyMs": 15000, "baseline_latencyMs": 3000 }
}

// Ollama reports queue overflow
{
  "id": "evt-lm-002",
  "timestamp": "2025-01-15T14:05:28.000Z",
  "source": { "category": "llm", "provider": "ollama", "instance": "localhost:11434" },
  "category": "model",
  "type": "model.queue_depth_high",
  "service": "ollama",
  "severity": "error",
  "correlation": { "model": "llama3:70b" },
  "provenance": { "connector": "ollama-adapter", "collectedAt": "2025-01-15T14:05:28.000Z" },
  "attributes": { "queue_depth": 18, "previous_queue_depth": 2 }
}
```

### 10.2 EvidenceMetric Examples

```json
// GPU utilization
{
  "id": "met-lm-001",
  "timestamp": "2025-01-15T14:05:00.000Z",
  "source": { "category": "observability", "provider": "prometheus", "instance": "gpu-node-1" },
  "metric": "gpu.utilization",
  "value": 99,
  "unit": "percent",
  "service": "ollama",
  "aggregation": "avg",
  "intervalMs": 60000,
  "dimensions": { "device": "cuda:0" },
  "correlation": { "host": "gpu-node-1", "model": "llama3:70b" },
  "provenance": {
    "connector": "prometheus-adapter",
    "collectedAt": "2025-01-15T14:05:05.000Z",
    "sourceRecordId": "gpu_utilization{device='cuda:0'}@1736942700"
  }
}

// Application latency p95
{
  "id": "met-lm-002",
  "timestamp": "2025-01-15T14:05:00.000Z",
  "source": { "category": "application", "provider": "my-app" },
  "metric": "http.request.duration",
  "value": 15000,
  "unit": "ms",
  "service": "my-app",
  "aggregation": "p95",
  "intervalMs": 300000,
  "dimensions": { "endpoint": "/generate", "model": "llama3:70b" },
  "correlation": { "service": "my-app", "model": "llama3:70b" },
  "provenance": { "connector": "prometheus-adapter", "collectedAt": "2025-01-15T14:05:05.000Z" }
}

// Prompt context tokens (before and after)
{
  "id": "met-lm-003",
  "timestamp": "2025-01-15T14:02:00.000Z",
  "source": { "category": "application", "provider": "my-app" },
  "metric": "llm.prompt.context_tokens",
  "value": 24000,
  "unit": "tokens",
  "service": "my-app",
  "aggregation": "instant",
  "dimensions": { "model": "llama3:70b" },
  "correlation": { "service": "my-app", "model": "llama3:70b" },
  "provenance": { "connector": "app-telemetry-adapter", "collectedAt": "2025-01-15T14:02:00.000Z" }
}
```

### 10.3 EvidenceChange Examples

```json
// Prompt/config change at 14:02
{
  "id": "chg-lm-001",
  "timestamp": "2025-01-15T14:02:00.000Z",
  "source": { "category": "deployment", "provider": "ci-pipeline" },
  "category": "model",
  "changeType": "prompt_context_window_changed",
  "entity": "prompt/v3",
  "before": { "contextTokens": 4000, "version": "v2" },
  "after": { "contextTokens": 24000, "version": "v3" },
  "actor": "ci-pipeline",
  "automated": true,
  "service": "my-app",
  "correlation": { "deploymentId": "deploy-20250115-1402", "service": "my-app", "model": "llama3:70b" },
  "provenance": {
    "connector": "deployment-adapter",
    "collectedAt": "2025-01-15T14:02:05.000Z",
    "sourceRecordId": "deploy-20250115-1402"
  }
}
```

### 10.4 How They Correlate

| Evidence Item | Correlation Keys Available |
|--------------|---------------------------|
| `chg-lm-001` (prompt change at 14:02) | `service=my-app`, `model=llama3:70b`, `deploymentId` |
| `met-lm-003` (context tokens jumped to 24K at 14:02) | `service=my-app`, `model=llama3:70b` |
| `met-lm-001` (GPU at 99% from 14:05) | `host=gpu-node-1`, `model=llama3:70b` |
| `evt-lm-002` (Ollama queue depth 18 at 14:05:28) | `model=llama3:70b` |
| `evt-lm-001` (app latency 15s at 14:05:30) | `requestId`, `model=llama3:70b` |

Without a shared `traceId`, these are correlated by:
1. `model=llama3:70b` (present in all items)
2. Time proximity — all evidence falls within a 4-minute window starting from the change
3. `service=my-app` (present in most)

The incident engine can build a causal chain:
- **Change at 14:02** → context tokens increased 6×
- **Metrics from 14:05** → GPU saturated, queue depth spiked
- **Events from 14:05:28–30** → model queue overflow, application latency 5× baseline

### 10.5 What Bob Can and Cannot Conclude

**Bob MAY conclude:**
- A prompt config change at 14:02 increased context tokens from 4,000 to 24,000
- GPU utilization reached 99% within 3 minutes of the change
- Application latency increased from 3s to 15s after the change
- The Ollama queue depth increased from 2 to 18, consistent with GPU saturation

**Bob MUST NOT claim:**
- That the database is healthy (no database evidence was collected — absence of evidence is not evidence of absence)
- That reducing the prompt would fix the issue (that is a hypothesis for a human to verify)
- That the GPU saturation was caused by the prompt change (correlation is observed; causation requires a controlled experiment)

---

## 11. Final Phase A File-Change Plan

This is the authoritative implementation list. Section 12 steps are numbered to match.

### 11.1 New Files

| # | File | What it contains |
|---|------|-----------------|
| 1 | `packages/contracts/src/evidence.ts` | All evidence wire types: `EvidenceSource`, `EvidenceSourceCategory`, `EvidenceProvenance`, `EvidenceCorrelation`, `EvidenceOrigin`, `EvidenceOriginKind`, `EvidenceAssertion`, `EvidenceSeverity`, `EvidenceEventCategory`, `EvidenceEvent`, `EvidenceMetricAggregation`, `EvidenceMetric`, `EvidenceChangeCategory`, `EvidenceChange`, `EvidenceRef`, `EvidenceQuery`, `EvidenceRepository` |
| 2 | `packages/contracts/src/adapters/telemetry-to-evidence.ts` | Pure function `telemetryEventToEvidenceEvent(t: TelemetryEvent): EvidenceEvent`. Maps all 7 `EventType` values to correct `EvidenceEventCategory`. Sets `sourceRecordId: t.id`. No I/O, no side effects. |
| 3 | `packages/contracts/src/adapters/index.ts` | `export * from "./telemetry-to-evidence.js"` |
| 4 | `services/incident-engine/src/evidence/repository.ts` | `InMemoryEvidenceRepository implements EvidenceRepository`. Three independent ring buffers: events cap 50 000, metrics cap 10 000, changes cap 5 000. Five-component idempotency key: `connector\|category\|provider\|instance\|sourceRecordId`. Methods: `appendEvent`, `appendMetric`, `appendChange`, `queryEvents`, `queryMetrics`, `queryChanges`. |
| 5 | `services/incident-engine/src/evidence/routes.ts` | `createEvidenceRouter(repo: EvidenceRepository)` factory. Three ingestion routes: `POST /evidence/events`, `POST /evidence/metrics`, `POST /evidence/changes`. Two query routes: `GET /evidence/events`, `GET /evidence/metrics`. No `app.locals` — repo passed via closure. |
| 6 | `services/bob-mcp/src/tools/evidence.ts` | `registerEvidenceTools(server: McpServer)`. Three tools: `query_evidence`, `get_incident_evidence`, `get_metric_window`. All call `tracerca-api` proxy endpoints at `/api/evidence/*`. |
| 7 | `scripts/test-evidence-acceptance.ps1` | Acceptance test (see Section 11.4). |

### 11.2 Files to Modify

| # | File | Exact change |
|---|------|-------------|
| 8 | `packages/contracts/src/index.ts` | Add `export * from "./evidence.js"`. Add `evidenceRefs?: EvidenceRef[]` to the existing `Incident` interface. No other changes. |
| 9 | `services/incident-engine/src/index.ts` | Instantiate `InMemoryEvidenceRepository`. Pass instance to `createEvidenceRouter(repo)`. Mount evidence router at `/evidence`. No other structural changes. |
| 10 | `services/incident-engine/src/router.ts` | In `POST /ingest`, after sorting and before `evaluate()`: adapt every event with `telemetryEventToEvidenceEvent`, call `await repo.appendEvent()` for each, collect returned IDs into `storedIds`. After `createIncident()` succeeds: set `incident.evidenceRefs = storedIds.map(id => ({ id, kind: "event" as const }))`. Non-incident batches still normalize and store; they just skip the `evidenceRefs` step. |
| 11 | `services/incident-engine/src/types.ts` | Add `evidenceRefs?: EvidenceRef[]` to local `Incident` interface. Import `EvidenceRef` from `@tracerca/contracts`. |
| 12 | `services/incident-engine/package.json` | Add `@tracerca/contracts` as a dependency so the adapter and evidence types can be imported. |
| 13 | `apps/tracerca-api/src/routes/incidents.ts` | Add two new proxy routes below existing ones: `GET /api/evidence/events` → `${INCIDENT_ENGINE_URL}/evidence/events` and `GET /api/evidence/metrics` → `${INCIDENT_ENGINE_URL}/evidence/metrics`. Also add `POST /api/evidence/events`, `POST /api/evidence/metrics`, `POST /api/evidence/changes` proxies so external connectors can POST through the unified API. |
| 14 | `services/bob-mcp/src/index.ts` | Import and call `registerEvidenceTools(server)` alongside existing registrations. |

### 11.3 Files NOT to Modify

| File | Reason |
|------|--------|
| `apps/demo-ai-app/src/router.ts` | Demo telemetry emission path unchanged |
| `apps/demo-ai-app/src/telemetry/store.ts` | TelemetryEvent ring buffer unchanged |
| `services/incident-engine/src/detector.ts` | Detection rules (R1/R2/R3) unchanged |
| `services/incident-engine/src/store.ts` | Incident ring buffer and `createIncident` signature unchanged |
| `services/replay-engine/**` | Replay flow unchanged |
| `apps/tracerca-api/src/index.ts` | No structural change — evidence routes go through incidents proxy file |
| `apps/tracerca-api/src/routes/replays.ts` | Unchanged |
| `apps/tracerca-api/src/routes/telemetry.ts` | Unchanged |
| `apps/tracerca-api/src/upstream.ts` | Unchanged |
| `services/bob-mcp/src/tools/incidents.ts` | Existing incident tools unchanged |
| `services/bob-mcp/src/tools/telemetry.ts` | Existing telemetry tools unchanged |
| `services/bob-mcp/src/tools/replay.ts` | Existing replay tools unchanged |
| `services/bob-mcp/src/client.ts` | MCP HTTP client unchanged |
| `docker-compose.yml` | No new container, no new port |
| `.bob/mcp.json` | New evidence tools go into the existing `bob-mcp` binary |
| `scripts/smoke-test.ps1` | All 28 existing assertions unchanged |

### 11.4 Acceptance Test: Generic Ingestion Decoupled from Simulator

`scripts/test-evidence-acceptance.ps1` — executed after `smoke-test.ps1` passes, does NOT require Provider A/B to be running.

**What it proves:** The evidence ingestion layer accepts evidence from any source, not only the Provider A/Provider B demo simulator. It is a self-contained HTTP test — no MCP server spawn required for the HTTP assertions; MCP assertions call Bob's `query_evidence` tool description endpoint.

**Steps:**
1. `POST http://localhost:4004/api/evidence/metrics` — submit one synthetic `EvidenceMetric`:
   ```json
   {
     "items": [{
       "id": "acc-met-001",
       "timestamp": "<now ISO>",
       "source": { "category": "llm", "provider": "ollama", "instance": "localhost:11434" },
       "metric": "gpu.utilization",
       "value": 87,
       "unit": "percent",
       "service": "ollama",
       "aggregation": "instant",
       "correlation": { "model": "llama3:8b" },
       "provenance": { "connector": "acceptance-test", "collectedAt": "<now ISO>", "sourceRecordId": "acc-met-001" }
     }]
   }
   ```
   Assert: HTTP 200, `accepted: 1`, `rejected: 0`.

2. `POST http://localhost:4004/api/evidence/changes` — submit one `EvidenceChange`:
   ```json
   {
     "items": [{
       "id": "acc-chg-001",
       "timestamp": "<now-5min ISO>",
       "source": { "category": "deployment", "provider": "ci-pipeline" },
       "category": "config",
       "changeType": "maxRetries_changed",
       "entity": "router/config",
       "before": 3,
       "after": 1,
       "origin": { "kind": "pipeline", "actor": "ci-pipeline", "assertion": "confirmed" },
       "service": "demo-ai-app",
       "correlation": { "environment": "demo" },
       "provenance": { "connector": "acceptance-test", "collectedAt": "<now-5min ISO>", "sourceRecordId": "acc-chg-001" }
     }]
   }
   ```
   Assert: HTTP 200, `accepted: 1`, `rejected: 0`.

3. `GET http://localhost:4004/api/evidence/metrics?sourceCategory=llm` — retrieve the stored metric.
   Assert: response contains exactly one metric with `metric: "gpu.utilization"` and `value: 87`.

4. `GET http://localhost:4004/api/evidence/events` — retrieve evidence events (should include normalized demo telemetry if smoke-test ran first, or be empty if this runs standalone).
   Assert: HTTP 200, response has `events` array.

5. Bob `query_evidence` MCP tool call (via `tracerca-api`):
   ```json
   {
     "startTime": "<now-10min ISO>",
     "endTime": "<now+1min ISO>",
     "types": ["metric", "change"]
   }
   ```
   Assert: response includes the synthetic `gpu.utilization` metric and the `maxRetries_changed` change in the returned arrays.

**Pass criteria:** All 5 assertions pass. No Provider A/B simulator interaction required.

---

## 12. Implementation Phases

### Phase A — Hackathon-Safe Minimum

**Goal:** Introduce the generic evidence model as a pure additive layer inside `services/incident-engine`. No new Docker service. No new port. No HTTP dependency from incident-engine to tracerca-api. No new vendor connector. Existing demo and telemetry behavior is byte-for-byte identical.

**Ordered implementation steps (matches Section 11 numbering):**

1. Create `packages/contracts/src/evidence.ts` — all wire types
2. Create `packages/contracts/src/adapters/telemetry-to-evidence.ts` — pure adapter function
3. Create `packages/contracts/src/adapters/index.ts` — re-export
4. Modify `packages/contracts/src/index.ts` — add evidence exports + `evidenceRefs?` on `Incident`
5. Create `services/incident-engine/src/evidence/repository.ts` — `InMemoryEvidenceRepository`
6. Create `services/incident-engine/src/evidence/routes.ts` — `createEvidenceRouter` factory
7. Modify `services/incident-engine/src/index.ts` — instantiate repo, mount evidence router
8. Modify `services/incident-engine/src/types.ts` — add `evidenceRefs?` to local `Incident`
9. Modify `services/incident-engine/src/router.ts` — normalize + store evidence at ingest boundary; populate `evidenceRefs` on incidents
10. Modify `services/incident-engine/package.json` — add `@tracerca/contracts` dependency
11. Modify `apps/tracerca-api/src/routes/incidents.ts` — add evidence proxy routes
12. Create `services/bob-mcp/src/tools/evidence.ts` — three MCP tools
13. Modify `services/bob-mcp/src/index.ts` — register evidence tools
14. Create `scripts/test-evidence-acceptance.ps1` — acceptance test

**Phase A constraints (non-negotiable):**
- Normalization happens at `POST /ingest` boundary, before `evaluate()` — not after `createIncident()`
- No changes to demo-ai-app telemetry emission path
- No changes to incident engine detection rules (R1/R2/R3)
- No changes to existing Bob MCP tools (incidents, telemetry, replay)
- No new Docker service, no new port
- No external vendor connector
- No database
- All 28 existing smoke-test assertions continue to pass

**Phase A success criteria:**
- `docker compose up` starts with identical container set; no new containers; no ports added
- `scripts/smoke-test.ps1` — all 28 assertions pass unchanged
- `scripts/test-evidence-acceptance.ps1` — all 5 acceptance assertions pass
- `get_incidents` and `get_incident` return identical payloads to before (`evidenceRefs` is a new optional field; existing callers ignore it)
- `get_incident_evidence("INC-001")` returns the incident record plus `EvidenceEvent` objects normalized from its telemetry timeline
- `query_evidence({ startTime, endTime })` returns `{ events, metrics, changes }` including both demo telemetry events and synthetic test items
- Healthy telemetry (non-incident requests) also appears in `query_evidence` results — not only incident-linked events

### Phase B — Post-Hackathon Production Evolution

**Scope:**
1. Replace `InMemoryEvidenceRepository` with `PostgresEvidenceRepository` (interface unchanged)
2. Add external connectors (Prometheus, Loki) that POST to `/api/evidence/metrics` and `/api/evidence/events`
3. Add `EvidenceCorrelationEngine` for time-window clustering when `traceId` is absent
4. Replace hard-coded rules in `incident-engine/detector.ts` with a rule evaluator that reads from `EvidenceRepository`
5. Deprecate `timeline: TelemetryEvent[]` once all callers migrate to `evidenceRefs`
6. Add LLM connectors (Ollama, vLLM)
7. Add deployment connectors (CI webhook → `EvidenceChange`)
8. Extract evidence repository and routes into a standalone service; `incident-engine` depends on it via HTTP; `tracerca-api` re-points proxy

**Phase B does not change:**
- `EvidenceRepository` interface (defined in `packages/contracts`)
- Ingestion API contracts
- `TelemetryEvent` or any existing incident fields

---

## 13. Risks and Migration Concerns

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `evidenceRefs?: EvidenceRef[]` breaks existing incident consumers | Low | Low | Field is `optional`; callers that do not read it are unaffected |
| `appendEvent` is synchronous inside `POST /ingest`, adding latency | Low | Low | In-memory append is O(1); 16 events × ~1 µs each ≈ 16 µs. Unmeasurable against the 750 ms retry delay already in the path. |
| Ring-buffer memory growth inside incident-engine | Low | Medium | Events: 50 000 × ~500 B ≈ 25 MB. Metrics: 10 000. Changes: 5 000. All ring-buffered with FIFO eviction — matches existing incident and telemetry store patterns. |
| Bob `query_evidence` and `get_telemetry_events` return different counts for the same incident | Low | Low | Adapter uses `TelemetryEvent.id` as both `EvidenceEvent.id` and `sourceRecordId`. Five-component idempotency key prevents duplicates. Counts are identical. |
| Adapter incorrectly maps a `TelemetryEvent` field | Medium | Medium | Pure function, no I/O, no side effects. Unit-testable against all 7 `EventType` values before merging. |
| `EvidenceOriginKind` values feel incomplete for future connectors | Low | Low | `"unknown"` escape hatch exists. Adding a new kind is a purely additive union extension. |
| `EvidenceAssertion` (`confirmed/observed/inferred`) vs origin.kind confusion | Low | Low | Documented explicitly in code: `kind` = who initiated; `assertion` = how certain. Comment enforced in type definition. |
| Phase B extraction of evidence store to standalone service | Low | Low | `createEvidenceRouter(repo)` factory pattern. Copy `repository.ts`, update one env var in incident-engine. No logic changes. |
| Phase B Postgres migration | Low | Low | `EvidenceRepository` interface is stable. Inject `PostgresEvidenceRepository` at startup. All other code unchanged. |
| Adding MCP tools increases Bob's reasoning overhead | Low | Low | Three tools only. Any new tool must retire an existing one. |

---

## Approval Request — Round 3 (Final)

All four round-3 corrections are reflected in this plan:

1. **Normalization at the ingest boundary, not post-`createIncident`.**
   Every `POST /ingest` call normalizes its events into `EvidenceEvent` records before `evaluate()` runs. Non-incident telemetry produces queryable evidence. The ingest response is unchanged.

2. **`EvidenceRepository` lives in `services/incident-engine` — no circular HTTP dependency.**
   `tracerca-api` proxies evidence queries to `incident-engine`, matching the existing pattern for `/incidents`. Dependency direction: `tracerca-api` → `incident-engine` (one-way, same as today).

3. **`evidenceRefs` populated only after successful store.**
   `appendEvent` returns synchronously. IDs are collected before `createIncident`. `evidenceRefs` is set on the incident only if all appends succeeded.

4. **`EvidenceOrigin` correctly split into `kind` (who) + `assertion` (how certain).**
   `"inferred"` is not a valid `kind` — it belongs only in `assertion`. Documented in the type definition with a comment.

5. **Three evidence kinds only: `event`, `metric`, `change`.**

6. **Three MCP tools: `query_evidence`, `get_incident_evidence`, `get_metric_window`.**

7. **Acceptance test proves generic ingestion is not tied to the simulator.**
   Synthetic `gpu.utilization` metric and a config change are POSTed, queried via HTTP, and queried via `query_evidence`. No Provider A/B interaction required.

8. **All 28 existing smoke-test assertions pass unchanged.**

**Please confirm to proceed with implementation.**
