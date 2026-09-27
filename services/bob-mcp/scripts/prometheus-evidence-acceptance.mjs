import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../build/index.js", import.meta.url))] });
const client = new Client({ name: "tracerca-prometheus-acceptance", version: "0.1.0" });
try { await client.connect(transport); const result = await client.callTool({ name: "query_evidence", arguments: { kinds: ["metric"], service: "local-llm-demo", sourceProvider: "prometheus", limit: 500 } }); const data = JSON.parse(result.content[0].text); if (!data.evidence?.some((x) => x.metric === "tracerca_llm_prompt_tokens") || !data.evidence?.some((x) => x.metric === "tracerca_llm_request_duration_seconds")) throw new Error("Bob query_evidence did not return Prometheus LLM metrics"); console.log(`PASS: Bob query_evidence returned ${data.count} Prometheus evidence records`); } finally { await transport.close(); }
