import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import type { ChatRequest, ChatResponse, ProviderResponse, RequestLog } from "./types";
import { writeLog } from "./logger";
import { append, getByRequestId } from "./telemetry/store";

const router = Router();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SIMULATOR_URL = process.env.PROVIDER_SIMULATOR_URL ?? "http://localhost:4001";
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES ?? "3", 10);
const RETRY_DELAY_MS = parseInt(process.env.RETRY_DELAY_MS ?? "750", 10);
const INCIDENT_ENGINE_URL = process.env.INCIDENT_ENGINE_URL ?? "http://localhost:4002";

// ---------------------------------------------------------------------------
// Fire-and-forget ingest — never affects /chat response path
// ---------------------------------------------------------------------------

function ingestToIncidentEngine(requestId: string, traceId: string): void {
  const events = getByRequestId(requestId);
  fetch(`${INCIDENT_ENGINE_URL}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, traceId, events }),
  }).catch(() => {
    // intentionally silent — incident engine is non-critical path
  });
}

// ---------------------------------------------------------------------------
// Low-level provider call using built-in fetch (Node 18+)
// Returns { status, body } — never throws for HTTP-level errors.
// ---------------------------------------------------------------------------

async function callProvider(
  path: string,
  message: string
): Promise<{ status: number; body: ProviderResponse | null; latencyMs: number }> {
  const start = Date.now();

  const res = await fetch(`${SIMULATOR_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  const latencyMs = Date.now() - start;
  const body = res.ok ? ((await res.json()) as ProviderResponse) : null;

  return { status: res.status, body, latencyMs };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// POST /chat
// ---------------------------------------------------------------------------

router.post("/chat", async (req: Request, res: Response) => {
  const requestId = uuidv4();
  const traceId = uuidv4();
  const source = "demo-ai-app";
  const { message } = req.body as ChatRequest;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: '"message" is required and must be a string' });
    return;
  }

  const ctx = { requestId, traceId, source };

  // ---- request.started ------------------------------------------------------
  append({ ...ctx, type: "request.started", attributes: { message } });

  const logs: RequestLog[] = [];
  let finalResponse: ChatResponse | null = null;

  // ---- Try Provider A with retries ------------------------------------------
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    // provider.requested
    append({ ...ctx, type: "provider.requested", provider: "A", attempt });

    const { status, body, latencyMs } = await callProvider("/provider-a/chat", message);

    // provider.response
    append({ ...ctx, type: "provider.response", provider: "A", attempt, status, latencyMs });

    const isLastAttempt = attempt === MAX_RETRIES + 1;
    const retryDelayMs = (!isLastAttempt && status !== 200) ? RETRY_DELAY_MS : undefined;

    // P01 structured log — preserved exactly
    const log: RequestLog = {
      requestId,
      provider: "A",
      attempt,
      status,
      latencyMs,
      fallbackUsed: false,
      timestamp: new Date().toISOString(),
      ...(retryDelayMs !== undefined && { retryDelayMs }),
    };
    logs.push(log);
    writeLog(log);

    if (status === 200 && body !== null) {
      finalResponse = { reply: body.reply, provider: "A", fallbackUsed: false };
      break;
    }

    if (retryDelayMs !== undefined) {
      // router.retry_scheduled (only between retries, not after last attempt)
      append({ ...ctx, type: "router.retry_scheduled", provider: "A", attempt, retryDelayMs });
      await sleep(retryDelayMs);
    }
  }

  // ---- Fallback to Provider B if Provider A never succeeded -----------------
  if (finalResponse === null) {
    // router.fallback
    append({ ...ctx, type: "router.fallback", provider: "A", fallbackUsed: true });

    // provider.requested B
    append({ ...ctx, type: "provider.requested", provider: "B", attempt: 1 });

    const { status, body, latencyMs } = await callProvider("/provider-b/chat", message);

    // provider.response B
    append({ ...ctx, type: "provider.response", provider: "B", attempt: 1, status, latencyMs, fallbackUsed: true });

    // P01 structured log — preserved exactly
    const log: RequestLog = {
      requestId,
      provider: "B",
      attempt: 1,
      status,
      latencyMs,
      fallbackUsed: true,
      timestamp: new Date().toISOString(),
    };
    logs.push(log);
    writeLog(log);

    if (status === 200 && body !== null) {
      finalResponse = { reply: body.reply, provider: "B", fallbackUsed: true };
    } else {
      // request.failed
      append({ ...ctx, type: "request.failed", provider: "B", status, attributes: { reason: "both providers failed" } });
      ingestToIncidentEngine(requestId, traceId);
      res.status(502).json({ error: "Both providers failed", requestId });
      return;
    }
  }

  // ---- request.completed ----------------------------------------------------
  append({
    ...ctx,
    type: "request.completed",
    provider: finalResponse.provider,
    fallbackUsed: finalResponse.fallbackUsed,
  });

  ingestToIncidentEngine(requestId, traceId);
  res.status(200).json(finalResponse);
});

export default router;
