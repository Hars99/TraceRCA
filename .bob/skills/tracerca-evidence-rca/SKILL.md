---
name: tracerca-evidence-rca
description: Investigate arbitrary TraceRCA normalized events, metrics, and changes and produce a structured, evidence-grounded RCA that separates observations, supported findings, hypotheses, unsupported conclusions, missing evidence, next checks, remediation, verification status, and confidence.
user-invocable: true
---

Investigate normalized TraceRCA evidence without assuming a vendor, service, metric, failure mode, or cause. Accept optional `service`, `environment`, `start time`, `end time`, and `incident ID` arguments. Never hard-code evidence values.

<Steps>
<Step>
Establish the scope: service, environment, time window, and incident ID when supplied. State missing scope explicitly. Do not silently invent a service, environment, or time boundary.
</Step>

<Step>
If an incident ID is supplied, call `get_incident_evidence` first. Use its normalized evidence to determine the incident's known services, environments, and timestamps. Then call `query_evidence` for events, metrics, and changes in the relevant incident window, applying supplied service and environment filters. Do not rely only on incident summary fields.

Without an incident ID, call `query_evidence` with `kinds: ["event", "metric", "change"]` and every supplied scope filter. If the result reaches the tool limit, report possible truncation as missing evidence and narrow the query rather than assuming completeness.
</Step>

<Step>
Sort all evidence chronologically by its returned timestamp. Deduplicate records with the same evidence ID. Preserve provenance, correlation, attributes, units, and assertion level when interpreting a record. Treat a correlation identifier such as `correlation.keys.runId` or a preserved source label such as `attributes.prometheusLabels.run_id` as a comparison boundary. Compare workloads or variants only when every selected record has the same correlation identifier. Never combine the latest value from one run with a value from another run. If no reliable comparable pair exists, state exactly: `Insufficient run-correlated evidence for a valid comparison.`

For relevant named metrics, call `get_metric_window` over the established time window to compare returned values. Compare meaningful groups present in evidence, such as before/after, normal/degraded, baseline/current, or workload labels. Do not manufacture a baseline or compare values with incompatible units or scope.
</Step>

<Step>
Separate reasoning into these categories:

- Observed Evidence: only values and facts directly returned by MCP evidence.
- Supported Findings: relationships supported by timing, correlation, or comparison. Use cautious language such as `coincided with`, `is consistent with`, or `available evidence supports`; do not promote correlation to causation.
- Hypotheses: plausible explanations clearly labeled as hypotheses and tied to observed evidence.
- Unsupported Conclusions: relevant claims that the available evidence cannot establish. Never present them as facts.
- Missing Evidence: absent signals needed to confirm or reject hypotheses.
- Recommended Next Checks: concrete evidence collection or comparison steps that address the missing evidence.

For model-serving latency investigations, consider runtime signals such as accelerator utilization, CPU utilization, queue depth, concurrency, and memory pressure only as missing evidence or next checks unless they were actually returned. Do not assert saturation, overload, exhaustion, a product bug, or a bottleneck without direct evidence.
</Step>

<Step>
Keep remediation and verification distinct. Label suggested actions as potential remediation, not verified fixes. Use `VERIFIED` only when returned TraceRCA deterministic replay, canary, or equivalent verification evidence explicitly verifies that remediation. Use `NOT VERIFIED` when verification ran and did not verify it. Otherwise use `NOT YET VERIFIED`.

Set confidence from evidence completeness and consistency using exactly `HIGH`, `MEDIUM`, or `LOW`. Do not produce a numeric probability.
</Step>

<Step>
Return exactly this section structure:

# TraceRCA Evidence RCA

## Scope
Service: <value or not established>
Environment: <value or not established>
Time window: <start and end, or not established>
Incident: <ID or not supplied>

## Observed Evidence
- <directly observed fact with value, timestamp/scope, and evidence source>

## Timeline
- <timestamp> → <observation>

## Supported Findings
- <carefully qualified evidence-backed relationship, or none established>

## Hypotheses
- <explicit hypothesis, or none established>

## Unsupported Conclusions
- <claim the available evidence does not support, or none identified>

## Missing Evidence
- <missing signal or context>

## Recommended Next Checks
- <specific next evidence check>

## Potential Remediation
- <unverified candidate tied to a supported finding, or insufficient evidence to recommend one>

## Verification Status
<VERIFIED, NOT VERIFIED, or NOT YET VERIFIED>

## Confidence
<HIGH, MEDIUM, or LOW>
</Step>
</Steps>

For the existing deterministic provider incident, preserve evidence-supported distinctions among trigger, retry/backoff amplifier, fallback recovery, and latency impact. Treat replay verification as separate evidence. For other investigations, do not force that incident-specific causal pattern onto the data.
