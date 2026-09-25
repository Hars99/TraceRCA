import { Router, Request, Response } from "express";
import type { IngestPayload } from "./types";
import { evaluate } from "./detector";
import { createIncident, listIncidents, getIncidentById } from "./store";

const router = Router();

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

export default router;
