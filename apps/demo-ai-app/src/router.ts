import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import type {
  ChatRequest,
  ChatResponse,
  ProviderResponse,
  RequestLog,
  RouterConfig,
  ReplayChatResult,
  RequestContext,
} from "./types";
import { writeLog } from "./logger";
import { append, getByRequestId } from "./telemetry/store";

const router = Router();

// ---------------------------------------------------------------------------
// Config — used by the normal /chat path only
// ---------------------------------------------------------------------------

const SIMULATOR_URL = process.env.PROVIDER_SIMULATOR_URL ?? "http://localhost:4001";
const INCIDENT_ENGINE_URL = process.env.INCIDENT_ENGINE_URL ?? "http://localhost:4002";

const DEFAULT_CONFIG: RouterConfig = {
  maxRetries: parseInt(process.env.MAX_RETRIES ?? "3", 10),
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS ?? "750", 10),
};

// ---------------------------------------------------------------------------
// Helpers
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

// Fire-and-forget ingest — never affects /chat response path
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
// executeChat — core routing logic, request-scoped config, no global mutation
//
// emitTelemetry=true  → normal /chat: events stored, incidents ingested
// emitTelemetry=false → replay-exec: counters returned, no telemetry side effects
// ---------------------------------------------------------------------------

export async function executeChat(
  message: string,
  config: RouterConfig,
  ctx: RequestContext,
  emitTelemetry: boolean
): Promise<{ chatResponse: ChatResponse | null; replayResult: ReplayChatResult }> {
  const { maxRetries, retryDelayMs } = config;
  const { requestId, traceId, source } = ctx;

  let providerAAttempts = 0;
  let provider429Count = 0;
  let retryCount = 0;
  let fallbackCount = 0;
  let finalProvider = "unknown";
  const requestStart = Date.now();

  if (emitTelemetry) {
    append({ requestId, traceId, source, type: "request.started", attributes: { message } });
  }

  let finalResponse: ChatResponse | null = null;

  // ---- Try Provider A with retries ------------------------------------------
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    providerAAttempts++;

    if (emitTelemetry) {
      append({ requestId, traceId, source, type: "provider.requested", provider: "A", attempt });
    }

    const { status, body, latencyMs } = await callProvider("/provider-a/chat", message);

    if (emitTelemetry) {
      append({ requestId, traceId, source, type: "provider.response", provider: "A", attempt, status, latencyMs });
    }

    const isLastAttempt = attempt === maxRetries + 1;
    const scheduledRetryDelay = (!isLastAttempt && status !== 200) ? retryDelayMs : undefined;

    if (emitTelemetry) {
      // P01 structured log — preserved exactly
      const log: RequestLog = {
        requestId,
        provider: "A",
        attempt,
        status,
        latencyMs,
        fallbackUsed: false,
        timestamp: new Date().toISOString(),
        ...(scheduledRetryDelay !== undefined && { retryDelayMs: scheduledRetryDelay }),
      };
      writeLog(log);
    }

    if (status === 200 && body !== null) {
      finalResponse = { reply: body.reply, provider: "A", fallbackUsed: false };
      finalProvider = "A";
      break;
    }

    if (status === 429) provider429Count++;

    if (scheduledRetryDelay !== undefined) {
      retryCount++;
      if (emitTelemetry) {
        append({ requestId, traceId, source, type: "router.retry_scheduled", provider: "A", attempt, retryDelayMs: scheduledRetryDelay });
      }
      await sleep(scheduledRetryDelay);
    }
  }

  // ---- Fallback to Provider B if Provider A never succeeded -----------------
  if (finalResponse === null) {
    fallbackCount++;

    if (emitTelemetry) {
      append({ requestId, traceId, source, type: "router.fallback", provider: "A", fallbackUsed: true });
      append({ requestId, traceId, source, type: "provider.requested", provider: "B", attempt: 1 });
    }

    const { status, body, latencyMs } = await callProvider("/provider-b/chat", message);

    if (emitTelemetry) {
      append({ requestId, traceId, source, type: "provider.response", provider: "B", attempt: 1, status, latencyMs, fallbackUsed: true });
      const log: RequestLog = {
        requestId,
        provider: "B",
        attempt: 1,
        status,
        latencyMs,
        fallbackUsed: true,
        timestamp: new Date().toISOString(),
      };
      writeLog(log);
    }

    if (status === 200 && body !== null) {
      finalResponse = { reply: body.reply, provider: "B", fallbackUsed: true };
      finalProvider = "B";
    } else {
      const totalLatencyMs = Date.now() - requestStart;
      if (emitTelemetry) {
        append({ requestId, traceId, source, type: "request.failed", provider: "B", status, attributes: { reason: "both providers failed" } });
        ingestToIncidentEngine(requestId, traceId);
      }
      return {
        chatResponse: null,
        replayResult: {
          success: false,
          totalLatencyMs,
          providerAAttempts,
          provider429Count,
          retryCount,
          fallbackCount,
          finalProvider: "B",
        },
      };
    }
  }

  const totalLatencyMs = Date.now() - requestStart;

  if (emitTelemetry) {
    append({
      requestId, traceId, source,
      type: "request.completed",
      provider: finalResponse.provider,
      fallbackUsed: finalResponse.fallbackUsed,
    });
    ingestToIncidentEngine(requestId, traceId);
  }

  return {
    chatResponse: finalResponse,
    replayResult: {
      success: true,
      totalLatencyMs,
      providerAAttempts,
      provider429Count,
      retryCount,
      fallbackCount,
      finalProvider,
    },
  };
}

// ---------------------------------------------------------------------------
// POST /chat — production path, unchanged external behaviour
// ---------------------------------------------------------------------------

router.post("/chat", async (req: Request, res: Response) => {
  const requestId = uuidv4();
  const traceId = uuidv4();
  const { message } = req.body as ChatRequest;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: '"message" is required and must be a string' });
    return;
  }

  const ctx: RequestContext = { requestId, traceId, source: "demo-ai-app" };
  const { chatResponse } = await executeChat(message, DEFAULT_CONFIG, ctx, true);

  if (chatResponse === null) {
    res.status(502).json({ error: "Both providers failed", requestId });
    return;
  }

  res.status(200).json(chatResponse);
});

// ---------------------------------------------------------------------------
// POST /replay-exec — internal endpoint for replay-engine
// Executes routing with caller-supplied config; no telemetry, no incident ingest
// ---------------------------------------------------------------------------

router.post("/replay-exec", async (req: Request, res: Response) => {
  const { message, maxRetries, retryDelayMs } = req.body as {
    message: string;
    maxRetries: number;
    retryDelayMs: number;
  };

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: '"message" is required' });
    return;
  }
  if (typeof maxRetries !== "number" || typeof retryDelayMs !== "number") {
    res.status(400).json({ error: '"maxRetries" and "retryDelayMs" must be numbers' });
    return;
  }

  const config: RouterConfig = { maxRetries, retryDelayMs };
  const ctx: RequestContext = {
    requestId: uuidv4(),
    traceId: uuidv4(),
    source: "replay-exec",
  };

  const { replayResult } = await executeChat(message, config, ctx, false);
  res.status(200).json(replayResult);
});

export default router;
