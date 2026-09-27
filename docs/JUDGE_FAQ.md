# TraceRCA Judge FAQ

## Why not just use ChatGPT / Claude / Codex?

General agents reason from the code, logs, and context supplied to them. TraceRCA systematically collects operational evidence, preserves provenance and correlation, exposes it through structured tools, builds incident timelines, and independently verifies eligible remediation candidates.

## Where does IBM Bob add value?

Bob is the investigation and reasoning layer. Through MCP it can discover incidents, query normalized evidence, distinguish facts from hypotheses, identify missing evidence, propose a constrained remediation, and invoke verification workflows.

## Is the root cause guaranteed?

No. TraceRCA makes RCA evidence-grounded, not infallible. Findings are qualified by available evidence and confidence, and unsupported conclusions must remain explicit.

## What is real in this demo?

The Ollama requests, model measurements, Prometheus scrape, TraceRCA connector ingestion, normalized metrics, `run_id` correlation, MCP evidence query, and dashboard comparison use real local runtime data.

## What is simulated?

Provider A and Provider B are controlled simulators used to create a repeatable HTTP 429, retry, fallback, and latency scenario. This makes replay comparison deterministic for judging.

## How do you prevent hallucinated RCA?

Bob receives structured evidence through MCP tools. Skills require direct observations, supported relationships, hypotheses, unsupported conclusions, and missing evidence to remain separate. Missing signals cannot be silently invented.

## How does verification work?

For the supported retry-remediation workflow, the replay engine runs the observed baseline and proposed candidate against the same controlled failure state. A deterministic comparator checks success, preserved recovery, fewer retries, and improved latency. Its returned `verified` field controls the verdict.

## Why is Prometheus used?

Prometheus is a real, widely used observability source. It demonstrates that TraceRCA can ingest external measurements through a generic connector rather than relying only on its deterministic incident scenario.

## Can this work with local models?

Yes. The implemented demo uses a locally installed Ollama model. TraceRCA records model and workload measurements without sending prompts to a hosted model provider.

## Can it work with OpenAI, Gemini, or vLLM?

The normalized evidence model is provider-agnostic, so connectors or applications can map evidence from those runtimes. Those integrations are not implemented in this repository today.

## Can this work with Kubernetes?

The evidence contracts can represent Kubernetes events, runtime metrics, and deployment changes, but a Kubernetes connector is future work.

## Is TraceRCA replacing Grafana or Prometheus?

No. TraceRCA consumes evidence from observability systems and adds correlation, RCA workflow, and verification.

## What happens when evidence is insufficient?

Bob must explicitly report missing evidence and avoid unsupported causal claims. For run comparisons, TraceRCA refuses to combine values from different run IDs.
