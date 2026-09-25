# Contributing to TraceRCA

Thank you for your interest in contributing to TraceRCA.

## Development Workflow

TraceRCA is structured as a TypeScript monorepo with multiple specialized microservices and Next.js dashboard.

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PowerShell (Windows / cross-platform)

### Local Build & Verification

Before submitting changes, ensure all packages build cleanly:

```powershell
# Build individual packages
npm --prefix packages/contracts run build
npm --prefix apps/demo-ai-app run build
npm --prefix apps/tracerca-api run build
npm --prefix apps/dashboard run build
npm --prefix services/incident-engine run build
npm --prefix services/provider-simulator run build
npm --prefix services/replay-engine run build
npm --prefix services/bob-mcp run build

# Run automated smoke test
.\scripts\smoke-test.ps1
```

### Core Architecture Discipline

1. **Evidence Grounding**: Never create probabilistic or hallucinated telemetry. Every incident finding must be backed by concrete trace records.
2. **Deterministic Verification**: Replay verification must be measured empirically against baseline and candidate executions.
3. **MCP Tool Contracts**: Maintain backward-compatible schemas in `packages/contracts` and `services/bob-mcp`.

