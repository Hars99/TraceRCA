import express, { Request, Response } from "express";

// Local type aliases — kept in sync with packages/contracts/src/index.ts
type ProviderMode = "normal" | "degraded";

interface AdminModeRequest {
  provider: "A" | "B";
  mode: ProviderMode;
}

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PROVIDER_SIMULATOR_PORT ?? "4001", 10);

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

const modes: Record<"A" | "B", ProviderMode> = {
  A: "normal",
  B: "normal",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Provider A  — POST /provider-a/chat
// Normal:   HTTP 200, 800–1200 ms latency
// Degraded: HTTP 429, no meaningful latency
// ---------------------------------------------------------------------------

app.post("/provider-a/chat", async (req: Request, res: Response) => {
  if (modes.A === "degraded") {
    res.status(429).json({ error: "Too Many Requests", provider: "A" });
    return;
  }

  const latency = randomBetween(800, 1200);
  await delay(latency);

  res.status(200).json({
    reply: `Provider A response to: "${req.body?.message ?? ""}"`,
    provider: "A",
  });
});

// ---------------------------------------------------------------------------
// Provider B  — POST /provider-b/chat
// Always:   HTTP 200, 1200–1600 ms latency
// ---------------------------------------------------------------------------

app.post("/provider-b/chat", async (req: Request, res: Response) => {
  const latency = randomBetween(1200, 1600);
  await delay(latency);

  res.status(200).json({
    reply: `Provider B response to: "${req.body?.message ?? ""}"`,
    provider: "B",
  });
});

// ---------------------------------------------------------------------------
// Admin  — POST /admin/mode
// ---------------------------------------------------------------------------

app.post("/admin/mode", (req: Request, res: Response) => {
  const body = req.body as Partial<AdminModeRequest>;

  const provider = body.provider;
  const mode = body.mode;

  if (provider !== "A" && provider !== "B") {
    res.status(400).json({ error: 'provider must be "A" or "B"' });
    return;
  }

  if (mode !== "normal" && mode !== "degraded") {
    res.status(400).json({ error: 'mode must be "normal" or "degraded"' });
    return;
  }

  modes[provider as "A" | "B"] = mode;

  res.status(200).json({ provider, mode, message: `Provider ${provider} set to ${mode}` });
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", modes });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(JSON.stringify({ event: "provider-simulator-started", port: PORT, timestamp: new Date().toISOString() }));
});
