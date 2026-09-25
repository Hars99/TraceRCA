---
name: tracerca-verified-remediation
description: Investigate a TraceRCA incident, derive a retry-reduction candidate from live evidence, run the real replay, and report whether the remediation is verified.
user-invocable: true
---

Take the supplied TraceRCA incident ID through evidence collection, root-cause interpretation, one constrained remediation candidate, a real replay, and an evidence-backed verification decision. This is not a generic remediation workflow.

The only supported remediation class is `REDUCE RETRIES BEFORE FALLBACK`. Target the retry/backoff amplifier, not the provider trigger. Do not change application configuration or claim that any remediation was deployed.

<Steps>
<Step>
Collect evidence before considering a remediation. For the supplied incident ID, call these tools sequentially and in exactly this order:

1. `get_incident`
2. `get_incident_events`
3. `get_incident_metrics`
4. `get_telemetry_events` using the `traceId` returned by `get_incident`

Do not call `run_replay` before all four evidence calls are complete. Do not use repository source code as incident evidence. Use only returned MCP values.
</Step>

<Step>
If the incident does not exist, stop. Return `REMEDIATION NOT APPLICABLE`, explain that the incident record is missing, and do not run replay. If events or metrics are missing, identify the missing evidence, do not fabricate configuration, and do not run replay.

Never invent provider responses, HTTP statuses, retry counts, retry delays, provider attempts, latency, fallback behavior, or replay results. Preserve the evidence discipline of the TraceRCA incident investigation skill.
</Step>

<Step>
Interpret the evidence without merging the trigger and amplifier:

- Trigger: repeated failures from the primary provider, such as repeated HTTP 429 responses if those statuses are returned.
- Amplifier: retry and backoff behavior that delayed fallback, if returned retry events support that reasoning.
- Recovery: a successful fallback request and completion, if returned events support it.
- Impact: the returned latency measurement before successful completion.

Do not convert an HTTP status into an unsupported provider-internal explanation. For example, `Provider A returned HTTP 429` is an observed fact, and `Repeated Provider A HTTP 429 responses triggered retry behavior` is allowed reasoning. Do not call this `Provider A rate limiting` unless the returned evidence explicitly states rate limiting.
</Step>

<Step>
The remediation is eligible only when all of these conditions are present in live evidence:

1. Repeated failures from the primary provider.
2. More than one observed retry; if `retryCount <= 1`, do not run retry reduction.
3. Retry/backoff behavior shown by `router.retry_scheduled` events.
4. Eventual fallback succeeded.
5. The incident impact includes latency before successful completion.

Derive the baseline only from evidence:

```yaml
baseline:
  maxRetries: <observed retryCount>
  retryDelayMs: <one consistent value from router.retry_scheduled events>
```

Derive the candidate as:

```yaml
candidate:
  maxRetries: 1
  retryDelayMs: <the same observed retryDelayMs>
```

Only `router.retry_scheduled` events may supply `retryDelayMs`. If retry delays are missing or inconsistent, report the ambiguity as `REMEDIATION NOT APPLICABLE` and do not run replay. Do not hard-code incident IDs, observed metrics, provider names, or delay values.
</Step>

<Step>
Before replay, present the proposal with the exact label `UNVERIFIED REMEDIATION CANDIDATE`. Explain that it reduces retries before fallback while retaining the observed retry delay. Do not say or imply that it works yet.

After evidence collection and candidate construction, call `run_replay` with:

```yaml
incidentId: <investigated incident ID>
baselineConfig:
  maxRetries: <derived observed retryCount>
  retryDelayMs: <derived consistent event value>
candidateConfig:
  maxRetries: 1
  retryDelayMs: <derived consistent event value>
```

Use the real MCP result. Do not simulate replay, calculate expected latency, or invent a comparison.
</Step>

<Step>
If `run_replay` returns a replay ID, call `get_replay` with that returned ID. Use the persisted replay record to confirm persistence. If `get_replay` fails, report that persistence confirmation was unavailable, but preserve and clearly identify the live `run_replay` result.

Verification is controlled by the returned replay result. Use `VERIFIED REMEDIATION` only when the actual `run_replay` result contains `verified: true` and the returned candidate comparison shows that the candidate succeeds, preserves the successful final outcome, reduces retries, and improves latency. If `verified: false`, use `REMEDIATION NOT VERIFIED`. If replay errors, use `REMEDIATION VERIFICATION FAILED`. Never change a false result to true through reasoning.
</Step>

<Step>
Return exactly this report structure:

# TraceRCA Verified Remediation

Incident: <id>
Severity: <severity>
Status: <status>

## Evidence

Summarize factual evidence from the four pre-replay MCP calls. Include the relevant trigger, retry events, fallback success, metrics, and trace ID. In any timeline included here, output exactly one line for every event returned by `get_incident_events`; preserve the original event ordering, event type, and each event's exact returned timestamp. Never merge `provider.response` and `router.retry_scheduled`, and never move a timestamp to another event.

## Root Cause

Trigger:
<evidence-backed trigger>

Amplifier:
<evidence-backed amplifier>

Recovery:
<evidence-backed recovery>

Impact:
<measured impact>

## Causal Chain

<evidence-backed cause-to-effect sequence; distinguish observed facts from reasoning>

## Unverified Remediation Candidate

UNVERIFIED REMEDIATION CANDIDATE

baseline:
  maxRetries: <derived>
  retryDelayMs: <derived>

candidate:
  maxRetries: <derived>
  retryDelayMs: <derived>

<Explain why this targets the retry/backoff amplifier rather than claiming to repair the provider trigger.>

## Replay Result

Replay ID:
<returned ID, or state that replay did not run or returned no ID>

Baseline:
- success: <returned value>
- latency: <returned value>
- attempts: <returned value>
- 429 count: <returned value>
- retries: <returned value>
- fallback: <returned value>
- final provider: <returned value>

Candidate:
- success: <returned value>
- latency: <returned value>
- attempts: <returned value>
- 429 count: <returned value>
- retries: <returned value>
- fallback: <returned value>
- final provider: <returned value>

Comparison:
- latencyDeltaMs: <returned value>
- latencyImprovementPercent: <returned value>
- retriesReducedBy: <returned value>
- providerAAttemptsReducedBy: <returned value>

## Verification

Use exactly one of:

VERIFIED REMEDIATION

REMEDIATION NOT VERIFIED

REMEDIATION VERIFICATION FAILED

REMEDIATION NOT APPLICABLE

Explain the selected result using only returned evidence and replay values.

## Persistence

State whether `get_replay` returned the persisted replay record. Do not claim persistence when that call failed or no replay ID was returned.
</Step>
</Steps>

Keep `OBSERVED FACT`, `REASONING`, `UNVERIFIED CANDIDATE`, and `VERIFIED RESULT` distinct in the report. The replay is an isolated experiment, not a production change. Never say that the remediation was deployed. The key distinction is: TraceRCA must replay the incident with the candidate configuration and measure the result before marking the remediation `VERIFIED REMEDIATION`.
