import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const [startTime, endTime] = process.argv.slice(2);
if (!startTime || !endTime) throw new Error("startTime and endTime are required");

const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../build/index.js", import.meta.url))] });
const client = new Client({ name: "tracerca-evidence-acceptance", version: "0.1.0" });
try {
  await client.connect(transport);
  const response = await client.callTool({ name: "query_evidence", arguments: { kinds: ["metric", "change"], service: "local-llm-api", environment: "development", startTime, endTime } });
  const payload = JSON.parse(response.content[0].text);
  if (!Array.isArray(payload.evidence) || !payload.evidence.some((item) => item.kind === "metric" && item.metric === "gpu.utilization") || !payload.evidence.some((item) => item.kind === "change" && item.entity === "prompt.context_limit")) throw new Error("Bob query_evidence did not return the expected metric and change");
  console.log("PASS: Bob MCP query_evidence returns normalized metric and change evidence");
} finally {
  await transport.close();
}
