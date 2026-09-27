import { Router, Request, Response } from "express";
import { proxyPost } from "../upstream";

const router = Router();
const INCIDENT_ENGINE_URL = process.env.INCIDENT_ENGINE_URL ?? "http://localhost:4002";

for (const kind of ["events", "metrics", "changes"]) {
  router.post(`/${kind}`, async (req: Request, res: Response) => {
    const { status, body } = await proxyPost("incident-engine", `${INCIDENT_ENGINE_URL}/evidence/${kind}`, req.body);
    res.status(status).json(body);
  });
}

router.post("/query", async (req: Request, res: Response) => {
  const { status, body } = await proxyPost("incident-engine", `${INCIDENT_ENGINE_URL}/evidence/query`, req.body);
  res.status(status).json(body);
});

export default router;
