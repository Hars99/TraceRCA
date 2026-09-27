import express from "express";

const app = express();
app.use(express.json({ limit: "2mb" }));
const port = parseInt(process.env.LOCAL_LLM_DEMO_PORT ?? "3002", 10);
const ollamaUrl = (process.env.OLLAMA_URL ?? "http://host.docker.internal:11434").replace(/\/$/, "");
const model = process.env.OLLAMA_MODEL ?? "";

type Measurement = { duration?: number; promptTokens?: number; completionTokens?: number; promptEvalDuration?: number; generationDuration?: number; tokensPerSecond?: number };
type WorkloadKey = { workload: string; runId: string };
const measurements = new Map<string, WorkloadKey & { measurement: Measurement }>();
const requests = new Map<string, WorkloadKey & { count: number }>();
const errors = new Map<string, WorkloadKey & { count: number }>();
function escapeLabel(value: string): string { return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n"); }
function key(workload: string, runId: string): string { return `${runId}\u0000${workload}`; }
function labels(workload: string, runId: string): string { return `{model="${escapeLabel(model)}",workload="${escapeLabel(workload)}",run_id="${escapeLabel(runId)}"}`; }
function gauge(lines: string[], name: string, value: number | undefined, workload: string, runId: string): void { if (value !== undefined && Number.isFinite(value)) lines.push(`${name}${labels(workload, runId)} ${value}`); }

app.get("/health", (_req, res) => res.status(200).json({ status: "ok", service: "local-llm-demo", model: model || null, ollamaUrl }));

app.get("/metrics", (_req, res) => {
  const lines = ["# HELP tracerca_llm_requests_total Real Ollama generation requests completed.", "# TYPE tracerca_llm_requests_total counter", "# HELP tracerca_llm_errors_total Real Ollama generation request errors.", "# TYPE tracerca_llm_errors_total counter"];
  for (const { workload, runId, count } of requests.values()) lines.push(`tracerca_llm_requests_total${labels(workload, runId)} ${count}`);
  for (const { workload, runId, count } of errors.values()) lines.push(`tracerca_llm_errors_total${labels(workload, runId)} ${count}`);
  const metrics: Array<[string, keyof Measurement]> = [["tracerca_llm_request_duration_seconds", "duration"], ["tracerca_llm_prompt_tokens", "promptTokens"], ["tracerca_llm_completion_tokens", "completionTokens"], ["tracerca_llm_prompt_eval_duration_seconds", "promptEvalDuration"], ["tracerca_llm_generation_duration_seconds", "generationDuration"], ["tracerca_llm_tokens_per_second", "tokensPerSecond"]];
  for (const [name, field] of metrics) { lines.push(`# TYPE ${name} gauge`); for (const { workload, runId, measurement } of measurements.values()) gauge(lines, name, measurement[field], workload, runId); }
  res.type("text/plain; version=0.0.4").send(`${lines.join("\n")}\n`);
});

app.post("/generate", async (req, res) => {
  const { prompt, repeat = 1, workload = "custom", runId = "uncorrelated" } = req.body as { prompt?: unknown; repeat?: unknown; workload?: unknown; runId?: unknown };
  if (typeof prompt !== "string" || !prompt.trim() || !Number.isInteger(repeat) || (repeat as number) < 1 || (repeat as number) > 25 || typeof workload !== "string" || !workload || typeof runId !== "string" || !runId) { res.status(400).json({ error: "prompt, workload, runId, and repeat (1-25 integer) must be valid when supplied" }); return; }
  if (!model) { res.status(503).json({ error: "OLLAMA_MODEL is not configured" }); return; }
  const actualPrompt = Array(repeat as number).fill(prompt).join("\n");
  const start = performance.now();
  try {
    const response = await fetch(`${ollamaUrl}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt: actualPrompt, stream: false }) });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : `Ollama HTTP ${response.status}`);
    const seconds = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? value / 1_000_000_000 : undefined;
    const duration = seconds(body.total_duration) ?? ((performance.now() - start) / 1000);
    const promptEvalDuration = seconds(body.prompt_eval_duration); const generationDuration = seconds(body.eval_duration); const completionTokens = typeof body.eval_count === "number" ? body.eval_count : undefined;
    const measurement: Measurement = { duration, promptTokens: typeof body.prompt_eval_count === "number" ? body.prompt_eval_count : undefined, completionTokens, promptEvalDuration, generationDuration, tokensPerSecond: completionTokens !== undefined && generationDuration && generationDuration > 0 ? completionTokens / generationDuration : undefined };
    const workloadKey = key(workload, runId);
    measurements.set(workloadKey, { workload, runId, measurement });
    requests.set(workloadKey, { workload, runId, count: (requests.get(workloadKey)?.count ?? 0) + 1 });
    res.status(200).json({ model, workload, runId, response: body.response, measurement });
  } catch (error) { const workloadKey = key(workload, runId); errors.set(workloadKey, { workload, runId, count: (errors.get(workloadKey)?.count ?? 0) + 1 }); res.status(502).json({ error: error instanceof Error ? error.message : String(error), ollamaUrl, model, runId }); }
});

app.listen(port, () => console.log(JSON.stringify({ event: "local-llm-demo-started", port, model, timestamp: new Date().toISOString() })));
