// ---------------------------------------------------------------------------
// tools/replay.ts — MCP tool registrations for TraceRCA replay
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPost } from "../client.js";

function text(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function registerReplayTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // run_replay
  // -------------------------------------------------------------------------
  server.tool(
    "run_replay",
    "Execute a real baseline/candidate replay against the TraceRCA demo app. Runs baseline config then candidate config sequentially against the live degraded provider, then returns both run results, a comparison (latencyDeltaMs, latencyImprovementPercent, retriesReducedBy, providerAAttemptsReducedBy), and a verified boolean. Use this to confirm a proposed config change actually improves behaviour before recommending it.",
    {
      baselineConfig: z.object({
        maxRetries: z.number().int().min(0).describe("Maximum number of retries before fallback"),
        retryDelayMs: z.number().int().min(0).describe("Delay in milliseconds between retries"),
      }).describe("Router config representing current/degraded behaviour, e.g. maxRetries=3"),
      candidateConfig: z.object({
        maxRetries: z.number().int().min(0).describe("Maximum number of retries before fallback"),
        retryDelayMs: z.number().int().min(0).describe("Delay in milliseconds between retries"),
      }).describe("Router config representing the proposed improvement, e.g. maxRetries=1"),
      incidentId: z.string().optional().describe('Optional incident ID to associate this replay record with, e.g. "INC-001"'),
    },
    async ({ baselineConfig, candidateConfig, incidentId }) => {
      const payload: Record<string, unknown> = { baselineConfig, candidateConfig };
      if (incidentId !== undefined) {
        payload.incidentId = incidentId;
      }
      const result = await apiPost("/api/replay", payload);
      if (!result.ok) {
        return { ...text(result), isError: true };
      }
      return text(result.data);
    }
  );

  // -------------------------------------------------------------------------
  // get_replay
  // -------------------------------------------------------------------------
  server.tool(
    "get_replay",
    "Return a previously completed replay record by ID, including baseline, candidate, comparison, and verified status.",
    { id: z.string().describe('Replay record ID, e.g. "RPL-001"') },
    async ({ id }) => {
      const result = await apiGet(`/api/replays/${encodeURIComponent(id)}`);
      if (!result.ok) {
        return { ...text(result), isError: true };
      }
      return text(result.data);
    }
  );
}
