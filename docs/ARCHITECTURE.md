# TraceRCA Architecture

TraceRCA is designed around a strict separation of concerns between operational execution, structured evidence aggregation, AI-driven reasoning, and deterministic verification.

---

## Architectural Overview

```mermaid
flowchart TD
    subgraph UI ["Operator Interface"]
        Dashboard["Dashboard\n(:3000 Next.js)"]
    end

    subgraph Reasoning ["Reasoning Layer (IBM Bob)"]
        Bob["IBM Bob\n(Incident & Remediation Skills)"]
        BobMCP["Bob MCP Server\n(services/bob-mcp - stdio)"]
        Bob -->|MCP Protocol| BobMCP
    end

    subgraph Gateway ["Gateway & API Plane"]
        API["TraceRCA API Gateway\n(:4004 Express)"]
    end

    subgraph Evidence ["Evidence Plane"]
        IncidentEngine["Incident Engine\n(:4002 Express)\n- Rule Evaluator\n- Incident Store"]
    end

    subgraph Verification ["Verification Layer"]
        ReplayEngine["Replay Engine\n(:4003 Express)\n- Workload Executor\n- Metrics Comparator\n- Replay Store"]
    end

    subgraph Data ["Data Plane"]
        DemoApp["Demo AI App\n(:3001 Express)\n- Request Router\n- Telemetry Store"]
        Simulator["Provider Simulator\n(:4001 Express)\n- Provider A (Degraded/Normal)\n- Provider B (Fallback)"]
    end

    Dashboard -->|HTTP REST| API
    BobMCP -->|HTTP REST| API

    API -->|Proxy GET /incidents| IncidentEngine
    API -->|Proxy POST /replay, GET /replays| ReplayEngine
    API -->|Proxy GET /telemetry| DemoApp

    DemoApp -->|1. Chat Traffic / Retries / Fallback| Simulator
    DemoApp -.->|2. Async Telemetry Ingest| IncidentEngine
    ReplayEngine -->|3. POST /replay-exec (Baseline & Candidate)| DemoApp
```

---

## Architectural Planes

### 1. Data Plane
The Data Plane handles end-user chat traffic and routes requests to upstream LLM providers.

- **Demo AI App (`apps/demo-ai-app`)**:
  - Implements a resilient request router with configurable retry counts and backoff delays (`MAX_RETRIES`, `RETRY_DELAY_MS`).
  - Emits fine-grained telemetry events for each lifecycle transition (`request.started`, `provider.requested`, `provider.response`, `router.retry_scheduled`, `router.fallback`, `request.completed`, `request.failed`).
  - Supports isolated execution via `/replay-exec` which executes routing configurations without polluting live telemetry streams.
- **Provider Simulator (`services/provider-simulator`)**:
  - Emulates Provider A (primary) with configurable modes (`normal` with 800–1200ms latency, or `degraded` returning HTTP 429).
  - Emulates Provider B (fallback) with reliable 1200–1600ms latency.
  - Exposes `/admin/mode` to simulate real-world provider degradation deterministically.

---

### 2. Evidence Plane
The Evidence Plane collects, persists, and analyzes raw telemetry to detect outages without relying on probabilistic AI guesses.

- **Telemetry Store (`apps/demo-ai-app/src/telemetry/store.ts`)**:
  - Ring buffer storing ordered telemetry events keyed by `requestId` and `traceId`.
- **Incident Engine (`services/incident-engine`)**:
  - Receives ingested telemetry events asynchronously.
  - Evaluates deterministic incident detection rules:
    - **R1**: Provider 429 count $\ge 2$
    - **R2**: Retry count $\ge 2$
    - **R3**: Fallback used and total latency $\ge 3000\text{ms}$
  - Builds structured incident records containing chronological event timelines, severity classifications, and quantitative impact metrics.

---

### 3. Reasoning Layer
The Reasoning Layer is powered by **IBM Bob** through the Model Context Protocol (MCP).

- **Principle of Grounded Reasoning**:
  - TraceRCA enforces a strict discipline: **IBM Bob never invents facts or fabricates metrics.**
  - All factual claims must be grounded in tool outputs returned by `tracerca-api` via `services/bob-mcp`.
- **IBM Bob Skills**:
  - **`tracerca-incident-investigation`**: Queries `get_incident`, `get_incident_events`, `get_incident_metrics`, and `get_telemetry_events`. Formulates a structured causal breakdown:
    - **Trigger**: The initial root event (e.g., Provider A returning HTTP 429).
    - **Amplifier**: System behaviors that compound the issue (e.g., 3 successive retries with 750ms backoff delays).
    - **Recovery**: The mechanism that preserved system availability (e.g., successful fallback to Provider B).
    - **Impact**: The measured customer consequence (e.g., elevated latency).
  - **`tracerca-verified-remediation`**: Derives a targeted remediation candidate targeting the **Amplifier** (reducing retries from 3 to 1) and triggers deterministic replay via `run_replay`.

---

### 4. Verification Layer
The Verification Layer validates proposed remediations before certifying them.

- **Replay Engine (`services/replay-engine`)**:
  - Takes baseline (`maxRetries=3, retryDelayMs=750`) and candidate (`maxRetries=1, retryDelayMs=750`) configurations.
  - Executes both configurations against the exact current provider conditions sequentially.
  - Computes deterministic comparative metrics:
    - $\Delta \text{Latency (ms)}$ and $\% \text{Improvement}$
    - Retries and Provider A attempts reduced
  - Evaluates the strict verification predicate:
    $$\text{verified} = \text{baseline.success} \land \text{candidate.success} \land (\text{candidate.latency} < \text{baseline.latency}) \land (\text{candidate.retries} < \text{baseline.retries})$$
  - Only when all conditions pass is the status marked as **`VERIFIED REMEDIATION`**.

---

## Service Contracts & Port Allocations

| Service | Port | Protocol | Primary Endpoints |
|---|---|---|---|
| **Dashboard** | `3000` | HTTP / HTML | `/`, `/incidents/[id]`, `/replays/[id]` |
| **Demo AI App** | `3001` | HTTP / JSON | `POST /chat`, `POST /replay-exec`, `GET /telemetry/events`, `GET /telemetry/summary` |
| **Provider Simulator** | `4001` | HTTP / JSON | `POST /provider-a/chat`, `POST /provider-b/chat`, `POST /admin/mode`, `GET /health` |
| **Incident Engine** | `4002` | HTTP / JSON | `POST /ingest`, `GET /incidents`, `GET /incidents/:id`, `GET /incidents/:id/events`, `GET /incidents/:id/metrics` |
| **Replay Engine** | `4003` | HTTP / JSON | `POST /replay`, `GET /replays`, `GET /replays/:id` |
| **TraceRCA API** | `4004` | HTTP / JSON | `GET /api/incidents`, `POST /api/replay`, `GET /api/replays`, `GET /api/telemetry/*` |
| **Bob MCP Server** | stdio | JSON-RPC (MCP) | Tools: `get_incident`, `get_incident_events`, `run_replay`, `get_replay`, etc. |

