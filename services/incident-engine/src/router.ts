import { Router, Request, Response } from "express";
import type { IngestPayload } from "./types";
import { evaluate } from "./detector";
import { createIncident, listIncidents, getIncidentById } from "./store";
import { evidenceRepository, telemetryEventToEvidenceEvent, validateEvidence, validateEvidenceQuery } from "./evidence";
import type { Evidence, EvidenceKind, EvidenceQuery, EvidenceRef } from "./evidence";
import { syncPrometheusEvidence } from "./connectors/prometheus";

const router = Router();
const MAX_EVIDENCE_BATCH = 500;

function ingestEvidence(kind: EvidenceKind, body: unknown): { error?: string; records?: Evidence[]; duplicates?: number } {
  const payload = body as { records?: unknown[] };
  const inputs = Array.isArray(payload?.records) ? payload.records : [body];
  if (inputs.length === 0 || inputs.length > MAX_EVIDENCE_BATCH) return { error: `records must contain 1 to ${MAX_EVIDENCE_BATCH} items` };
  const records: Evidence[] = [];
  let duplicates = 0;
  for (const input of inputs) {
    const error = validateEvidence(input, kind);
    if (error) return { error };
    const saved = evidenceRepository.save(input as Evidence);
    records.push(saved.evidence);
    if (saved.duplicate) duplicates += 1;
  }
  return { records, duplicates };
}

// ---------------------------------------------------------------------------
// POST /ingest  — internal, called by demo-ai-app after each completed request
// ---------------------------------------------------------------------------

router.post("/ingest", (req: Request, res: Response) => {
  const { requestId, traceId, events } = req.body as IngestPayload;

  if (!requestId || !traceId || !Array.isArray(events)) {
    res.status(400).json({ error: "requestId, traceId and events are required" });
    return;
  }

  // Sort events by timestamp (defensive — should already be ordered)
  const sorted = events.slice().sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Every telemetry event becomes normalized evidence before detection, including
  // healthy requests that will not create an incident.
  const evidenceRefs: EvidenceRef[] = sorted.map((event) => {
    const saved = evidenceRepository.save(telemetryEventToEvidenceEvent(event));
    return { id: saved.evidence.id, kind: saved.evidence.kind };
  });

  const result = evaluate(sorted);

  if (!result.triggered) {
    res.status(200).json({ incident: null, triggered: false });
    return;
  }

  const incident = createIncident({
    status: "open",
    severity: result.severity,
    trigger: result.trigger,
    requestId,
    traceId,
    summary: result.summary,
    metrics: result.metrics,
    evidence: result.evidence,
    evidenceRefs,
    timeline: sorted,
  });

  console.log(JSON.stringify({
    event: "incident.created",
    id: incident.id,
    severity: incident.severity,
    requestId,
    traceId,
    timestamp: incident.createdAt,
  }));

  res.status(201).json({ incident, triggered: true });
});

// ---------------------------------------------------------------------------
// POST /evidence/events | /metrics | /changes
// ---------------------------------------------------------------------------

for (const kind of ["event", "metric", "change"] as EvidenceKind[]) {
  router.post(`/evidence/${kind}s`, (req: Request, res: Response) => {
    const result = ingestEvidence(kind, req.body);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json({ count: result.records!.length, duplicates: result.duplicates, evidence: result.records });
  });
}

// ---------------------------------------------------------------------------
// POST /evidence/query
// ---------------------------------------------------------------------------

router.post("/evidence/query", (req: Request, res: Response) => {
  const query = (req.body ?? {}) as EvidenceQuery;
  const error = validateEvidenceQuery(query);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  const evidence = evidenceRepository.query(query);
  res.status(200).json({ count: evidence.length, evidence });
});

// POST /connectors/prometheus/sync — generic Prometheus samples to EvidenceMetric.
router.post("/connectors/prometheus/sync", async (req: Request, res: Response) => {
  try {
    const result = await syncPrometheusEvidence(req.body?.queries);
    res.status(200).json(result);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// ---------------------------------------------------------------------------
// GET /incidents
// ---------------------------------------------------------------------------

router.get("/incidents", (_req: Request, res: Response) => {
  const incidents = listIncidents().map((i) => ({
    id: i.id,
    createdAt: i.createdAt,
    status: i.status,
    severity: i.severity,
    trigger: i.trigger,
    requestId: i.requestId,
    traceId: i.traceId,
    summary: i.summary,
  }));
  res.status(200).json({ count: incidents.length, incidents });
});

// ---------------------------------------------------------------------------
// GET /incidents/:id
// ---------------------------------------------------------------------------

router.get("/incidents/:id", (req: Request, res: Response) => {
  const incident = getIncidentById(req.params.id);
  if (!incident) {
    res.status(404).json({ error: `Incident ${req.params.id} not found` });
    return;
  }
  // Return full incident minus the timeline (keep response lean)
  const { timeline: _timeline, ...meta } = incident;
  res.status(200).json(meta);
});

// ---------------------------------------------------------------------------
// GET /incidents/:id/events  — ordered telemetry timeline
// ---------------------------------------------------------------------------

router.get("/incidents/:id/events", (req: Request, res: Response) => {
  const incident = getIncidentById(req.params.id);
  if (!incident) {
    res.status(404).json({ error: `Incident ${req.params.id} not found` });
    return;
  }
  res.status(200).json({ count: incident.timeline.length, events: incident.timeline });
});

// ---------------------------------------------------------------------------
// GET /incidents/:id/metrics
// ---------------------------------------------------------------------------

router.get("/incidents/:id/metrics", (req: Request, res: Response) => {
  const incident = getIncidentById(req.params.id);
  if (!incident) {
    res.status(404).json({ error: `Incident ${req.params.id} not found` });
    return;
  }
  res.status(200).json(incident.metrics);
});

// GET /incidents/:id/evidence — resolve only refs stored for this incident.
router.get("/incidents/:id/evidence", (req: Request, res: Response) => {
  const incident = getIncidentById(req.params.id);
  if (!incident) {
    res.status(404).json({ error: `Incident ${req.params.id} not found` });
    return;
  }
  const evidence = (incident.evidenceRefs ?? [])
    .map((ref) => evidenceRepository.getById(ref.id))
    .filter((record): record is Evidence => record !== undefined);
  res.status(200).json({ incidentId: incident.id, count: evidence.length, evidence });
});

export default router;
