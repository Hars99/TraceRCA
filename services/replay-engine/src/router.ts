import { Router, Request, Response } from "express";
import type { ReplayRequest } from "./types";
import { executeReplayRun } from "./executor";
import { compare, verify } from "./comparator";
import { createReplay, listReplays, getReplayById } from "./store";

const router = Router();

// ---------------------------------------------------------------------------
// POST /replay
// ---------------------------------------------------------------------------

router.post("/replay", async (req: Request, res: Response) => {
  const body = req.body as Partial<ReplayRequest>;

  const baselineConfig = body.baselineConfig;
  const candidateConfig = body.candidateConfig;

  if (
    !baselineConfig ||
    typeof baselineConfig.maxRetries !== "number" ||
    typeof baselineConfig.retryDelayMs !== "number"
  ) {
    res.status(400).json({ error: "baselineConfig must have numeric maxRetries and retryDelayMs" });
    return;
  }

  if (
    !candidateConfig ||
    typeof candidateConfig.maxRetries !== "number" ||
    typeof candidateConfig.retryDelayMs !== "number"
  ) {
    res.status(400).json({ error: "candidateConfig must have numeric maxRetries and retryDelayMs" });
    return;
  }

  let baseline;
  let candidate;

  try {
    // Run baseline then candidate sequentially — same workload, same degraded provider state
    baseline = await executeReplayRun(baselineConfig);
    candidate = await executeReplayRun(candidateConfig);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Replay execution failed: ${message}` });
    return;
  }

  const comparison = compare(baseline, candidate);
  const verified = verify(baseline, candidate);

  const record = createReplay({
    incidentId: body.incidentId,
    status: "completed",
    baselineConfig,
    candidateConfig,
    baseline,
    candidate,
    comparison,
    verified,
  });

  console.log(JSON.stringify({
    event: "replay.completed",
    id: record.id,
    verified,
    latencyDeltaMs: comparison.latencyDeltaMs,
    retriesReducedBy: comparison.retriesReducedBy,
    timestamp: record.createdAt,
  }));

  res.status(201).json(record);
});

// ---------------------------------------------------------------------------
// GET /replays
// ---------------------------------------------------------------------------

router.get("/replays", (_req: Request, res: Response) => {
  const replays = listReplays();
  res.status(200).json({ count: replays.length, replays });
});

// ---------------------------------------------------------------------------
// GET /replays/:id
// ---------------------------------------------------------------------------

router.get("/replays/:id", (req: Request, res: Response) => {
  const record = getReplayById(req.params.id);
  if (!record) {
    res.status(404).json({ error: `Replay ${req.params.id} not found` });
    return;
  }
  res.status(200).json(record);
});

export default router;
