// ---------------------------------------------------------------------------
// tools/telemetry.ts — MCP tool registrations for TraceRCA telemetry
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet } from "../client.js";

function text(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function registerTelemetryTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // get_telemetry_summary
  // -------------------------------------------------------------------------
  server.tool(
    "get_telemetry_summary",
    "Return aggregate telemetry counters: totalRequests, completedRequests, failedRequests, provider429Count, retryCount, fallbackCount.",
    {},
    async () => {
      const result = await apiGet("/api/telemetry/summary");
      if (!result.ok) {
        return { ...text(result), isError: true };
      }
      return text(result.data);
    }
  );

  // -------------------------------------------------------------------------
  // get_telemetry_events
  // -------------------------------------------------------------------------
  server.tool(
    "get_telemetry_events",
    "Return raw telemetry events. Filter by requestId or traceId to narrow to a single request chain. Use limit to cap results.",
    {
      requestId: z.string().optional().describe("Filter events to a single requestId"),
      traceId: z.string().optional().describe("Filter events to a single traceId"),
      limit: z.number().int().positive().optional().describe("Maximum number of events to return"),
    },
    async ({ requestId, traceId, limit }) => {
      const params = new URLSearchParams();
      if (requestId) params.set("requestId", requestId);
      if (traceId) params.set("traceId", traceId);
      if (limit !== undefined) params.set("limit", String(limit));

      const query = params.size > 0 ? `?${params.toString()}` : "";
      const result = await apiGet(`/api/telemetry/events${query}`);
      if (!result.ok) {
        return { ...text(result), isError: true };
      }
      return text(result.data);
    }
  );
}
