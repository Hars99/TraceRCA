---
name: tracerca-incident-investigation
description: Investigate a TraceRCA incident with ordered MCP evidence and produce an evidence-grounded Trigger, Amplifier, Recovery, Impact, and confidence assessment.
user-invocable: true
---

Investigate only the incident ID supplied by the user.

<Steps>
<Step>
Call `get_incident` with `{ "id": "<incident ID>" }`.

If the tool reports that the incident does not exist, stop. State that no RCA can be produced because the incident record is missing. Do not invent an incident, telemetry, metrics, or conclusions.
</Step>

<Step>
For an existing incident, call these tools sequentially and in exactly this order:

1. `get_incident_events` with the incident ID.
2. `get_incident_metrics` with the incident ID.
3. `get_telemetry_events` with `{ "traceId": "<traceId from get_incident>" }`.

Record tool errors or missing fields as missing evidence. Do not replace them with assumptions. Do not call any replay tool.
</Step>

<Step>
Separate observed facts from reasoning. Cite the source in prose, such as incident record, ordered incident events, incident metrics, or trace telemetry. Use only returned values.

Interpret the causal roles as follows. Do not convert an observed HTTP status into an unsupported provider-internal explanation. For example, state the fact as `Provider A returned HTTP 429`, and reason only that repeated Provider A HTTP 429 responses triggered retry behavior unless the returned evidence explicitly states a cause such as rate limiting.

- Trigger: the earliest event or condition that initiated the incident. When the evidence supports it, repeated HTTP 429 responses from the failing provider are the trigger.
- Amplifier: system behavior that increased the impact. When the evidence supports it, retries and their observed backoff delayed fallback.
- Recovery: the mechanism that eventually completed the request. When the evidence supports it, a successful fallback request identifies the recovery provider.
- Impact: a measured consequence, such as the returned total request latency. Do not call latency elevated unless the returned incident evidence supports that characterization.

Do not hard-code an incident ID, provider name, retry count, retry delay, latency, or any other metric. Derive all values from the tool responses. If a causal role cannot be established, say so and name the missing evidence.
</Step>

<Step>
Return exactly this report structure:

# TraceRCA Incident Investigation

Incident: <incident ID or not found>
Severity: <returned severity or missing>
Status: <returned status or missing>

## Observed Evidence

List factual evidence from all successful tool responses. Include relevant status codes, providers, attempts, retry delays, fallback events, timestamps, trace ID, and returned metrics without fabricating or inferring absent values.

## Timeline

Output exactly one line for every event returned by `get_incident_events`. Preserve the original returned event ordering and event type. Preserve each event's exact returned timestamp; never move an event's timestamp onto another event. Never merge two events into one line, including `provider.response` and `router.retry_scheduled`. Do not create events that were not returned.

## Root Cause

Trigger: <fact-based finding or evidence missing>
Amplifier: <fact-based finding or evidence missing>
Recovery: <fact-based finding or evidence missing>

## Causal Chain

Explain the evidence-backed sequence from trigger to amplifier to recovery. Clearly mark reasoning as reasoning rather than fact. Do not infer provider-internal causes from HTTP status codes; use only explanations explicitly supported by returned evidence.

## Impact

State the measurable consequence and its returned metric(s). State when evidence is insufficient to measure impact.

## Confidence

Use exactly one of `High`, `Medium`, or `Low`, based on evidence completeness rather than a numeric score:

- High: the incident record, ordered events, metrics, and trace telemetry are present and consistent.
- Medium: the incident exists but one or more supporting sources are incomplete or partially unavailable.
- Low: the incident is missing, the primary evidence is unavailable, or the sources materially conflict.
</Step>
</Steps>

Never claim that a remediation is verified. Do not include remediation unless requested. If a suggestion is requested, label it exactly `UNVERIFIED REMEDIATION CANDIDATE` and make clear that it is not validated by this investigation.
