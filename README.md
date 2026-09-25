# TraceRCA

TraceRCA is an AI-native incident investigation and verified remediation system powered by IBM Bob.

## The Problem

Traditional incident tooling can surface symptoms, but engineers still have to reconstruct causal chains and often apply fixes without testing them against the failing scenario. This leads to extended MTTR, guesswork in configuration changes, and the risk of deploying unvalidated patches during live outages.

## The TraceRCA Loop

TraceRCA closes the loop between symptom detection, causal analysis, and verified remediation:

```text
Production problem
  ↓
Structured evidence
  ↓
IBM Bob investigation
  ↓
Causal chain (Trigger → Amplifier → Recovery → Impact)
  ↓
Remediation candidate
  ↓
Controlled replay
  ↓
Measured verification (VERIFIED REMEDIATION)
```

## Core Differentiator

TraceRCA does not stop at AI-generated RCA. It tests the remediation through replay before marking it **VERIFIED**. 

While LLMs are effective at synthesizing evidence and proposing hypotheses, deploying unverified configuration changes can worsen outages. TraceRCA combines IBM Bob's reasoning capabilities with a deterministic replay engine that executes the proposed fix against the live failure condition to measure latency and attempt reductions empirically.

---

## Architecture

TraceRCA separates operational execution, telemetry aggregation, AI reasoning, and deterministic verification into distinct planes:

```text
       +-------------------------------------------------------------+
       |                           IBM Bob                           |
       |  (Skills: incident-investigation, verified-remediation)     |
       +------------------------------+------------------------------+
                                      | MCP (stdio)
                                      v
       +-------------------------------------------------------------+
       |                       TraceRCA API                          |
       |                   (Port 4004 / Gateway)                     |
       +-------+----------------------+----------------------+-------+
               |                      |                      |
               v                      v                      v
      +-----------------+   +------------------+   +------------------+
      | Incident Engine |   |  Replay Engine   |   |   Demo AI App    |
      |   (Port 4002)   |   |   (Port 4003)    |   |   (Port 3001)    |
      +--------+--------+   +--------+---------+   +--------+---------+
               ^                     |                      |
               | (telemetry ingest)  | (replay execution)   |
               +---------------------+                      |
                                                            v
                                                   +------------------+
                                                   |Provider Simulator|
                                                   |   (Port 4001)    |
                                                   +------------------+
```

---

## Components

| Component | Port | Description |
|---|---|---|
| **Dashboard** | `3000` | Next.js 16 operator console displaying incidents, timelines, metrics, and replay verification diffs. |
| **Demo AI App** | `3001` | Express application simulating LLM routing across providers with configurable retries, delays, and telemetry. |
| **Provider Simulator** | `4001` | Mock upstream LLM providers (Provider A with configurable degraded/normal states, Provider B as reliable fallback). |
| **Incident Engine** | `4002` | Ingests telemetry, evaluates deterministic incident detection rules, and manages incident records and timelines. |
| **Replay Engine** | `4003` | Executes side-by-side baseline vs candidate router runs against current provider conditions and computes verification diffs. |
| **TraceRCA API** | `4004` | Unified REST gateway orchestrating incident, replay, and telemetry services. |
| **Bob MCP Server** | stdio | Model Context Protocol server exposing TraceRCA tools to IBM Bob. |

---

## IBM Bob Integration

TraceRCA integrates directly into IBM Bob using the Model Context Protocol (MCP) and custom Bob skills located in `.bob/`:

1. **MCP Server (`services/bob-mcp`)**: Configured in `.bob/mcp.json`. Connects IBM Bob to `tracerca-api` via stdio, exposing tools:
   - `get_incident`, `list_incidents`, `get_incident_events`, `get_incident_metrics`
   - `get_telemetry_events`, `get_telemetry_summary`
   - `run_replay`, `get_replay`, `list_replays`

2. **Incident Investigation Skill (`.bob/skills/tracerca-incident-investigation`)**:
   - Performs ordered MCP evidence queries (`get_incident` → `get_incident_events` → `get_incident_metrics` → `get_telemetry_events`).
   - Reconstructs the exact causal structure without fabricating facts: **Trigger** (Provider A 429s), **Amplifier** (retries and backoff delays), **Recovery** (Provider B fallback), and **Impact** (total latency).

3. **Verified Remediation Skill (`.bob/skills/tracerca-verified-remediation`)**:
   - Analyzes incident evidence and derives a constrained remediation candidate.
   - Executes real replay via `run_replay` tool.
   - Compares baseline vs candidate empirical metrics and assigns **`VERIFIED REMEDIATION`** only when the candidate succeeds, preserves fallback recovery, reduces retries, and improves latency.

---

## Demo Scenario

1. **Normal State**: Traffic to Demo AI App routes to Provider A, completing in ~800–1200ms.
2. **Degradation**: Provider A is switched to `degraded` mode (returning HTTP 429 Too Many Requests).
3. **Amplification**: Demo AI App attempts Provider A, encounters HTTP 429, schedules 3 retries with 750ms backoff delay (adding >2250ms of delay).
4. **Fallback Recovery**: After exhausting retries, traffic falls back to Provider B and completes.
5. **Incident Detection**: Incident Engine detects repeated 429s and excessive latency, creating an open incident with full trace timeline.

---

## Verified Remediation

The remediation targets the **Amplifier** (excessive retries delaying recovery) rather than guessing external provider fixes:

- **Baseline Configuration**: `maxRetries = 3`, `retryDelayMs = 750`
- **Candidate Configuration**: `maxRetries = 1`, `retryDelayMs = 750`

During replay, the candidate configuration detects the failing primary provider faster, sheds 2 unnecessary retry delays, and executes fallback to Provider B significantly earlier—reducing total request latency while maintaining 100% request completion.

---

## Running the Project

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (optional, for local standalone runs)
- PowerShell (Windows / cross-platform PowerShell)

### 1. Start all services

```powershell
.\scripts\start-demo.ps1
```
*Or manually:*
```powershell
docker compose up -d --build
```

### 2. Verify Stack Health

```powershell
.\scripts\smoke-test.ps1
```

---

## Preparing Demo Data

To reset state and deterministically generate a fresh incident and verified replay run:

```powershell
.\scripts\prepare-demo.ps1
```

This script will:
1. Verify API health
2. Set Provider A to degraded mode
3. Trigger a failing request through Demo AI App
4. Fetch the generated incident ID
5. Run the baseline vs candidate replay
6. Output incident details, latency improvements, and dashboard links

---

## IBM Bob Demo

In IBM Bob, open the TraceRCA workspace and run the custom skills against the incident ID returned by the demo preparation script (e.g. `INC-001`):

### 1. Investigate Incident
```text
/tracerca-incident-investigation INC-001
```
Bob will query MCP tools sequentially, present the factual timeline, isolate Trigger vs Amplifier vs Recovery, and report confidence.

### 2. Run Verified Remediation
```text
/tracerca-verified-remediation INC-001
```
Bob will extract baseline parameters, construct candidate configuration (`maxRetries = 1`), trigger live replay via MCP, compare empirical results, and conclude with `VERIFIED REMEDIATION`.

---

## Dashboard

Open your browser to:
- **Overview**: [http://localhost:3000](http://localhost:3000)
- **Incidents**: `http://localhost:3000/incidents/<incident-id>`
- **Replays**: `http://localhost:3000/replays/<replay-id>`

---

## Ports Summary

| Port | Service |
|---|---|
| `3000` | Dashboard (Next.js) |
| `3001` | Demo AI App |
| `4001` | Provider Simulator |
| `4002` | Incident Engine |
| `4003` | Replay Engine |
| `4004` | TraceRCA API Gateway |

---

## Project Structure

```text
TraceRCA/
├── .bob/
│   ├── mcp.json                               # Bob MCP configuration
│   └── skills/
│       ├── tracerca-incident-investigation/   # Bob RCA skill
│       └── tracerca-verified-remediation/     # Bob Replay & Verification skill
├── apps/
│   ├── dashboard/                             # Next.js 16 Web UI
│   ├── demo-ai-app/                           # Core AI routing application
│   └── tracerca-api/                          # Unified API Gateway
├── packages/
│   └── contracts/                             # Shared TypeScript types & interfaces
├── services/
│   ├── bob-mcp/                               # MCP Server connecting Bob to API
│   ├── incident-engine/                       # Telemetry ingest & rule evaluator
│   ├── provider-simulator/                    # Mocked LLM providers (A & B)
│   └── replay-engine/                         # Deterministic replay executor & verifier
├── docs/
│   ├── ARCHITECTURE.md                        # Architectural specification
│   └── DEMO_RUNBOOK.md                        # 3-5 minute demo walkthrough
├── scripts/
│   ├── prepare-demo.ps1                       # Deterministic demo setup
│   ├── smoke-test.ps1                         # End-to-end test suite
│   └── start-demo.ps1                         # Container startup & healthcheck
├── docker-compose.yml
└── README.md
```

---

## Limitations

TraceRCA is a focused hackathon prototype designed to validate the concept of AI-driven incident investigation and replay verification:
- **Simulated Providers**: Upstream LLM providers are emulated via `provider-simulator` to produce deterministic latency and error profiles.
- **In-Memory Storage**: Telemetry, incidents, and replay records are stored in memory for rapid iteration without external database dependencies.
- **Constrained Remediation Class**: The MVP focuses on retry/backoff reduction before fallback as the primary verified remediation mechanism.
- **Controlled Replay Environment**: Replays are executed in the controlled TraceRCA test environment rather than directly on production workloads.
- **No Production Deployment Claim**: TraceRCA verifies candidate configurations in isolated replay runs; it does not automatically deploy changes to live production clusters.

---

## Hackathon Scope

To maximize reliability, transparency, and clarity during evaluation, the following features were intentionally excluded from this hackathon MVP:
- No external relational or document database (PostgreSQL, MongoDB)
- No user authentication or multi-tenant authorization
- No Kubernetes deployment manifests or cloud-specific operators
- No third-party LLM API keys required for core service operation
- No WebSocket streams or complex pub/sub brokers
- No external monitoring platforms (Prometheus, Grafana) — all visualization is natively provided by the TraceRCA Dashboard