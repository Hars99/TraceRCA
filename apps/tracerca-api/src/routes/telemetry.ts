import { Router, Request, Response } from "express";
import { proxyGet } from "../upstream";

const router = Router();

const DEMO_APP_URL = process.env.DEMO_APP_URL ?? "http://localhost:3001";

// GET /api/telemetry/events
// Forwards supported query params: requestId, traceId, limit
router.get("/events", async (req: Request, res: Response) => {
  const { requestId, traceId, limit } = req.query as Record<string, string | undefined>;

  const params = new URLSearchParams();
  if (requestId) params.set("requestId", requestId);
  if (traceId)   params.set("traceId", traceId);
  if (limit)     params.set("limit", limit);

  const query = params.size > 0 ? `?${params.toString()}` : "";

  const { status, body } = await proxyGet(
    "demo-ai-app",
    `${DEMO_APP_URL}/telemetry/events`,
    query
  );
  res.status(status).json(body);
});

// GET /api/telemetry/summary
router.get("/summary", async (_req: Request, res: Response) => {
  const { status, body } = await proxyGet(
    "demo-ai-app",
    `${DEMO_APP_URL}/telemetry/summary`
  );
  res.status(status).json(body);
});

export default router;
