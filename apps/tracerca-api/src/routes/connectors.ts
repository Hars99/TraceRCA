import { Router, Request, Response } from "express";
import { proxyPost } from "../upstream";
const router = Router();
const INCIDENT_ENGINE_URL = process.env.INCIDENT_ENGINE_URL ?? "http://localhost:4002";
router.post("/prometheus/sync", async (req: Request, res: Response) => {
  const { status, body } = await proxyPost("incident-engine", `${INCIDENT_ENGINE_URL}/connectors/prometheus/sync`, req.body);
  res.status(status).json(body);
});
export default router;
