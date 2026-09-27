import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [expectedRunId, normalPromptArg, normalDurationArg, highPromptArg, highDurationArg] = process.argv.slice(2);
const mcpEntry = fileURLToPath(new URL("../build/index.js", import.meta.url));
const skillPath = fileURLToPath(new URL("../../../.bob/skills/tracerca-evidence-rca/SKILL.md", import.meta.url));
const transport = new StdioClientTransport({ command: process.execPath, args: [mcpEntry] });
const client = new Client({ name: "tracerca-evidence-rca-acceptance", version: "0.1.0" });

function assert(condition, message) { if (!condition) throw new Error(message); }
function runIdOf(item) { return item.correlation?.keys?.runId ?? item.attributes?.prometheusLabels?.run_id; }
function workloadOf(item) { return item.attributes?.prometheusLabels?.workload; }
function numericArgument(value, name) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  assert(Number.isFinite(parsed), `${name} must be numeric`);
  return parsed;
}

try {
  await client.connect(transport);
  const response = await client.callTool({ name: "query_evidence", arguments: { kinds: ["metric"], service: "local-llm-demo", sourceProvider: "prometheus", limit: 500 } });
  assert(!response.isError, "query_evidence returned an MCP error");
  const payload = JSON.parse(response.content[0].text);
  assert(Array.isArray(payload.evidence) && payload.evidence.length > 0, "query_evidence returned no local-llm-demo metrics");

  const correlated = payload.evidence.filter((item) => typeof runIdOf(item) === "string" && runIdOf(item));
  assert(correlated.length > 0, "No run-correlated local-llm-demo evidence was returned");
  const newest = correlated.reduce((selected, item) => item.timestamp > selected.timestamp ? item : selected);
  const currentRunId = runIdOf(newest);
  assert(!expectedRunId || currentRunId === expectedRunId, `Newest evidence run ${currentRunId} did not match expected current run ${expectedRunId}`);
  const runEvidence = correlated.filter((item) => runIdOf(item) === currentRunId);
  assert(runEvidence.every((item) => runIdOf(item) === currentRunId), "Evidence from an older run entered the current-run selection");

  function metric(metricName, workload) {
    const matches = runEvidence.filter((item) => item.kind === "metric" && item.metric === metricName && workloadOf(item) === workload).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    assert(matches.length > 0, `Current run ${currentRunId} is missing ${metricName} for ${workload}`);
    return matches[0];
  }
  const selected = {
    normalPrompt: metric("tracerca_llm_prompt_tokens", "normal"),
    normalDuration: metric("tracerca_llm_request_duration_seconds", "normal"),
    highPrompt: metric("tracerca_llm_prompt_tokens", "high-context"),
    highDuration: metric("tracerca_llm_request_duration_seconds", "high-context"),
  };
  assert(Object.values(selected).every((item) => runIdOf(item) === currentRunId), "Compared values do not share one run ID");

  const expected = {
    normalPrompt: numericArgument(normalPromptArg, "normal prompt tokens"), normalDuration: numericArgument(normalDurationArg, "normal duration"),
    highPrompt: numericArgument(highPromptArg, "high-context prompt tokens"), highDuration: numericArgument(highDurationArg, "high-context duration"),
  };
  for (const [name, value] of Object.entries(expected)) if (value !== undefined) assert(selected[name].value === value, `${name} evidence ${selected[name].value} did not match demo measurement ${value}`);

  const skill = await readFile(skillPath, "utf8");
  for (const tool of ["query_evidence", "get_incident_evidence", "get_metric_window"]) assert(skill.includes(`\`${tool}\``), `Generic RCA skill does not reference ${tool}`);
  assert(skill.includes("Insufficient run-correlated evidence for a valid comparison."), "Generic RCA skill lacks the run-correlation failure rule");
  const tools = await client.listTools();
  assert(!tools.tools.some((tool) => tool.name.toLowerCase().includes("ollama")), "A vendor-specific Ollama MCP tool was introduced");

  console.log(JSON.stringify({ status: "PASS", runId: currentRunId, normal: { promptTokens: selected.normalPrompt.value, duration: selected.normalDuration.value }, highContext: { promptTokens: selected.highPrompt.value, duration: selected.highDuration.value }, evidenceMatchesDemo: expectedRunId ? true : "not supplied" }));
} finally {
  await transport.close();
}
