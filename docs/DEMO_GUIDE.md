# TraceRCA Judge Demo Guide

Target duration: 4–5 minutes. Prepare both demo stories before presenting and keep the dashboard tabs open.

## 0:00–0:30 — Problem

Say:

> Production failures have evidence spread across applications, providers, runtimes, infrastructure, deployments, and observability systems. Pasting selected logs into a chat loses provenance, correlation, and the ability to verify a proposed fix.

Open the [dashboard overview](http://localhost:3000). Point to the live platform status and the two investigation cards.

## 0:30–1:00 — TraceRCA Architecture

Explain:

- TraceRCA collects and normalizes events, metrics, and changes.
- IBM Bob investigates that evidence through MCP tools rather than pasted logs.
- Bob can propose a remediation, but an independent replay or validator owns verification truth.

Use the phrase: **evidence collection + Bob reasoning + independent verification**.

## 1:00–2:15 — Demo A: Verified Incident

Open http://localhost:3000/incidents/INC-001.

Show the ordered timeline:

- Provider A returned repeated HTTP 429 responses.
- Retry and backoff events delayed fallback.
- Fallback activated and Provider B completed the request.
- Total request latency is measured, not estimated.

Point to the structured RCA:

- Trigger: returned Provider A failures.
- Amplifier: retry/backoff behavior.
- Recovery: Provider B fallback.
- Impact: measured latency.

Open http://localhost:3000/replays/RPL-001. Compare the baseline and candidate retry counts and latencies. Point to the API-backed `VERIFIED REMEDIATION` result.

Key message:

> Bob proposes; TraceRCA verifies.

## 2:15–3:30 — Demo B: Real AI Observability

Open http://localhost:3000/evidence/local-llm.

Point out:

- `REAL OBSERVABILITY DATA`;
- source `Prometheus` and runtime `Ollama`;
- the actual model, environment, and current `run_id`;
- normal and high-context token, duration, and completion measurements;
- both workloads are selected from the same run.

Explain that these values came from real local model requests. Do not predict which workload will be faster; show what the current run measured.

Walk through Observed Evidence, Supported Findings, Hypotheses, Unsupported Conclusions, and Missing Evidence. Emphasize that correlation is not automatically promoted to causation. This investigation remains `NOT YET VERIFIED` because no remediation validation ran.

## 3:30–4:15 — Why IBM Bob

Say:

> Bob is not receiving pasted logs. It uses structured MCP tools to query incidents, timelines, metrics, generic evidence, and replay results. TraceRCA preserves provenance and correlation; Bob applies evidence-disciplined reasoning over that data.

Mention the three skills: incident investigation, verified remediation, and generic evidence RCA.

## 4:15–5:00 — Close

Explain that the same generic evidence layer can support future Kubernetes, OpenTelemetry, database, GPU/runtime, and deployment/Git connectors. Clearly label those as future extensions.

Closing line:

> TraceRCA turns fragmented production signals into evidence-grounded diagnosis, then verifies remediation where validation is available.

## Pre-demo Checklist

Run:

```powershell
.\scripts\reset-demo.ps1
.\scripts\prepare-demo.ps1
.\scripts\prometheus-ollama-demo.ps1
.\scripts\final-demo-check.ps1
```

Confirm the final script prints `READY FOR DEMO` before presenting.
