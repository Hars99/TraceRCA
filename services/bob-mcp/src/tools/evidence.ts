import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPost } from "../client.js";

function text(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

const querySchema = {
  kinds: z.array(z.enum(["event", "metric", "change"])).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  sourceCategory: z.enum(["application", "llm", "observability", "runtime", "database", "deployment", "repository", "custom"]).optional(),
  sourceProvider: z.string().optional(),
  service: z.string().optional(),
  environment: z.string().optional(),
  traceId: z.string().optional(),
  requestId: z.string().optional(),
  eventType: z.string().optional(),
  metric: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
};

export function registerEvidenceTools(server: McpServer): void {
  server.tool(
    "query_evidence",
    "Query normalized TraceRCA evidence. Returned records are observed data; do not infer causal links that are not supported by the returned evidence.",
    querySchema,
    async (query) => {
      const payload = {
        ...query,
        source: query.sourceCategory || query.sourceProvider ? { category: query.sourceCategory, provider: query.sourceProvider } : undefined,
      };
      delete (payload as { sourceCategory?: string }).sourceCategory;
      delete (payload as { sourceProvider?: string }).sourceProvider;
      const result = await apiPost("/api/evidence/query", payload);
      return result.ok ? text(result.data) : { ...text(result), isError: true };
    }
  );

  server.tool(
    "get_incident_evidence",
    "Resolve normalized evidence that was stored from the telemetry batch that created a known incident.",
    { id: z.string().describe('Incident ID, e.g. "INC-001"') },
    async ({ id }) => {
      const result = await apiGet(`/api/incidents/${encodeURIComponent(id)}/evidence`);
      return result.ok ? text(result.data) : { ...text(result), isError: true };
    }
  );

  server.tool(
    "get_metric_window",
    "Return one named metric over a required time window, optionally scoped by source or service. This is a metric-only evidence query.",
    {
      metric: z.string().min(1), startTime: z.string().datetime(), endTime: z.string().datetime(),
      sourceCategory: querySchema.sourceCategory, sourceProvider: z.string().optional(), service: z.string().optional(), environment: z.string().optional(), limit: z.number().int().min(1).max(500).optional(),
    },
    async ({ metric, startTime, endTime, sourceCategory, sourceProvider, service, environment, limit }) => {
      const result = await apiPost("/api/evidence/query", {
        kinds: ["metric"], metric, startTime, endTime, source: sourceCategory || sourceProvider ? { category: sourceCategory, provider: sourceProvider } : undefined, service, environment, limit,
      });
      return result.ok ? text(result.data) : { ...text(result), isError: true };
    }
  );
}
