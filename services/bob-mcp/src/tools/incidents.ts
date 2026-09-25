// ---------------------------------------------------------------------------
// tools/incidents.ts — MCP tool registrations for TraceRCA incidents
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet } from "../client.js";

function text(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function registerIncidentTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // get_incidents
  // -------------------------------------------------------------------------
  server.tool(
    "get_incidents",
    "Return all known TraceRCA incidents as a summary list (id, createdAt, status, severity, trigger, requestId, traceId, summary). Use this to discover incident IDs before drilling into detail, events, or metrics.",
    {},
    async () => {
      const result = await apiGet("/api/incidents");
      if (!result.ok) {
        return { ...text(result), isError: true };
      }
      return text(result.data);
    }
  );

  // -------------------------------------------------------------------------
  // get_incident
  // -------------------------------------------------------------------------
  server.tool(
    "get_incident",
    "Return the full TraceRCA incident record for a given ID: severity, trigger, requestId, traceId, summary, metrics, and evidence. Does NOT include the ordered telemetry timeline — use get_incident_events for that.",
    { id: z.string().describe('Incident ID, e.g. "INC-001"') },
    async ({ id }) => {
      const result = await apiGet(`/api/incidents/${encodeURIComponent(id)}`);
      if (!result.ok) {
        return { ...text(result), isError: true };
      }
      return text(result.data);
    }
  );

  // -------------------------------------------------------------------------
  // get_incident_events
  // -------------------------------------------------------------------------
  server.tool(
    "get_incident_events",
    "Return the complete ordered telemetry event timeline for an incident, suitable for root-cause analysis. Events are chronological: request.started → provider.requested → provider.response → router.retry_scheduled → router.fallback → request.completed. Each event carries provider, attempt, status, latencyMs, and other trace attributes.",
    { id: z.string().describe('Incident ID, e.g. "INC-001"') },
    async ({ id }) => {
      const result = await apiGet(`/api/incidents/${encodeURIComponent(id)}/events`);
      if (!result.ok) {
        return { ...text(result), isError: true };
      }
      return text(result.data);
    }
  );

  // -------------------------------------------------------------------------
  // get_incident_metrics
  // -------------------------------------------------------------------------
  server.tool(
    "get_incident_metrics",
    "Return the deterministic quantitative metrics computed for an incident by the incident engine: totalLatencyMs, provider429Count (HTTP 429s received from Provider A), retryCount (retry attempts made), fallbackCount (times fallback to Provider B was activated), providerAAttempts (total Provider A call attempts), finalProvider (the provider that ultimately served the request).",
    { id: z.string().describe('Incident ID, e.g. "INC-001"') },
    async ({ id }) => {
      const result = await apiGet(`/api/incidents/${encodeURIComponent(id)}/metrics`);
      if (!result.ok) {
        return { ...text(result), isError: true };
      }
      return text(result.data);
    }
  );
}
