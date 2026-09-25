import { Router, Request, Response } from "express";
import { proxyGet, proxyPost, REPLAY_UPSTREAM_TIMEOUT_MS } from "../upstream";

const router = Router();

const REPLAY_ENGINE_URL =
  process.env.REPLAY_ENGINE_URL ?? "http://localhost:4003";

// POST /api/replay
router.post("/replay", async (req: Request, res: Response) => {
  const { status, body } = await proxyPost(
    "replay-engine",
    `${REPLAY_ENGINE_URL}/replay`,
    req.body,
    { timeoutMs: REPLAY_UPSTREAM_TIMEOUT_MS }
  );
  res.status(status).json(body);
});

// GET /api/replays
router.get("/replays", async (_req: Request, res: Response) => {
  const { status, body } = await proxyGet(
    "replay-engine",
    `${REPLAY_ENGINE_URL}/replays`
  );
  res.status(status).json(body);
});

// GET /api/replays/:id
router.get("/replays/:id", async (req: Request, res: Response) => {
  const { status, body } = await proxyGet(
    "replay-engine",
    `${REPLAY_ENGINE_URL}/replays/${req.params.id}`
  );
  res.status(status).json(body);
});

export default router;
