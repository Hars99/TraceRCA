import { Router, Request, Response } from "express";
import { proxyGet } from "../upstream";

const router = Router();

const INCIDENT_ENGINE_URL =
  process.env.INCIDENT_ENGINE_URL ?? "http://localhost:4002";

// GET /api/incidents
router.get("/", async (_req: Request, res: Response) => {
  const { status, body } = await proxyGet(
    "incident-engine",
    `${INCIDENT_ENGINE_URL}/incidents`
  );
  res.status(status).json(body);
});

// GET /api/incidents/:id
router.get("/:id", async (req: Request, res: Response) => {
  const { status, body } = await proxyGet(
    "incident-engine",
    `${INCIDENT_ENGINE_URL}/incidents/${req.params.id}`
  );
  res.status(status).json(body);
});

// GET /api/incidents/:id/events
router.get("/:id/events", async (req: Request, res: Response) => {
  const { status, body } = await proxyGet(
    "incident-engine",
    `${INCIDENT_ENGINE_URL}/incidents/${req.params.id}/events`
  );
  res.status(status).json(body);
});

// GET /api/incidents/:id/metrics
router.get("/:id/metrics", async (req: Request, res: Response) => {
  const { status, body } = await proxyGet(
    "incident-engine",
    `${INCIDENT_ENGINE_URL}/incidents/${req.params.id}/metrics`
  );
  res.status(status).json(body);
});

export default router;
