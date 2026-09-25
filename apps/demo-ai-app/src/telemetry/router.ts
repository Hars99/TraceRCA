import { Router, Request, Response } from "express";
import { getAll, getByRequestId, getByTraceId, getSummary } from "./store";
import type { TelemetryEvent } from "./types";

const telemetryRouter = Router();

// ---------------------------------------------------------------------------
// GET /telemetry/events
// Query params: requestId, traceId, limit
// ---------------------------------------------------------------------------

telemetryRouter.get("/events", (req: Request, res: Response) => {
  const { requestId, traceId, limit } = req.query as Record<string, string | undefined>;

  let events: TelemetryEvent[];

  if (requestId) {
    events = getByRequestId(requestId);
  } else if (traceId) {
    events = getByTraceId(traceId);
  } else {
    events = getAll();
  }

  if (limit !== undefined) {
    const n = parseInt(limit, 10);
    if (!isNaN(n) && n > 0) {
      events = events.slice(-n); // most recent n
    }
  }

  res.status(200).json({ count: events.length, events });
});

// ---------------------------------------------------------------------------
// GET /telemetry/summary
// ---------------------------------------------------------------------------

telemetryRouter.get("/summary", (_req: Request, res: Response) => {
  res.status(200).json(getSummary());
});

export default telemetryRouter;
