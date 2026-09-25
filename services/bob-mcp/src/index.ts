#!/usr/bin/env node
// ---------------------------------------------------------------------------
// index.ts — TraceRCA MCP server entry point
//
// Runs on stdio. Bob spawns this process and communicates over stdin/stdout.
// All logging goes to stderr so it never corrupts the MCP protocol channel.
// ---------------------------------------------------------------------------

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerIncidentTools } from "./tools/incidents.js";
import { registerTelemetryTools } from "./tools/telemetry.js";
import { registerReplayTools } from "./tools/replay.js";

const server = new McpServer({
  name: "tracerca",
  version: "0.1.0",
});

registerIncidentTools(server);
registerTelemetryTools(server);
registerReplayTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    JSON.stringify({
      event: "bob-mcp-started",
      server: "tracerca",
      transport: "stdio",
      timestamp: new Date().toISOString(),
    })
  );
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      event: "bob-mcp-fatal",
      message: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    })
  );
  process.exit(1);
});
