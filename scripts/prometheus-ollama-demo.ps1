# Real Ollama -> Prometheus -> TraceRCA EvidenceMetric demo. Never downloads models.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$runId = "ollama-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
$hostOllama = if ($env:OLLAMA_HOST_URL) { $env:OLLAMA_HOST_URL } else { "http://localhost:11434" }
$api = "http://localhost:4004"; $prometheusPort = if ($env:PROMETHEUS_PORT) { $env:PROMETHEUS_PORT } else { "9091" }; $prometheus = "http://localhost:$prometheusPort"
function Wait-Ready([string]$Url, [string]$Name, [switch]$Http) { for ($i=0; $i -lt 20; $i++) { try { if ($Http) { if ((Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { return } } elseif ((Invoke-RestMethod $Url -TimeoutSec 3).status -eq "ok") { return } } catch {}; Start-Sleep 1 }; throw "$Name did not become ready: $Url" }
function Post-Json([string]$Url, $Body) { Invoke-RestMethod -Uri $Url -Method Post -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 10) -TimeoutSec 120 }
function Wait-Prometheus([string]$Query, [int]$Minimum) { for ($i=0; $i -lt 20; $i++) { try { $q=[uri]::EscapeDataString($Query); $r=Invoke-RestMethod "$prometheus/api/v1/query?query=$q" -TimeoutSec 5; if ($r.status -eq "success" -and $r.data.result.Count -ge $Minimum) { return $r } } catch {}; Start-Sleep 2 }; throw "Prometheus did not return $Minimum sample(s) for: $Query" }

Write-Host "TraceRCA - Real Local LLM Observability Demo" -ForegroundColor Cyan
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker is required." }
try { $tags=Invoke-RestMethod "$hostOllama/api/tags" -TimeoutSec 5 } catch { throw "Ollama is unavailable at $hostOllama. Start Ollama and retry." }
$model = if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } elseif ($tags.models.Count -gt 0) { $tags.models[0].name } else { "" }
if (-not $model -or -not (@($tags.models.name) -contains $model)) { throw "No usable configured Ollama model. Set OLLAMA_MODEL to an installed model, then run: ollama pull <configured-model>" }
$env:OLLAMA_MODEL=$model
docker compose up -d --build local-llm-demo prometheus incident-engine tracerca-api | Out-Host
Wait-Ready "$api/health" "TraceRCA API"; Wait-Ready "http://localhost:3002/health" "local-llm-demo"; Wait-Ready "$prometheus/-/ready" "Prometheus" -Http
$normal=Post-Json "http://localhost:3002/generate" @{ prompt="Summarize this short request in one sentence."; repeat=1; workload="normal"; runId=$runId }
Wait-Prometheus ('tracerca_llm_prompt_tokens{{workload="normal",run_id="{0}"}}' -f $runId) 1 | Out-Null
$largePrompt=("Explain the following system design clearly and concisely. " * 200)
$high=Post-Json "http://localhost:3002/generate" @{ prompt=$largePrompt; repeat=1; workload="high-context"; runId=$runId }
Wait-Prometheus ('tracerca_llm_prompt_tokens{{workload="high-context",run_id="{0}"}}' -f $runId) 1 | Out-Null
Wait-Prometheus ('tracerca_llm_prompt_tokens{{run_id="{0}"}}' -f $runId) 2 | Out-Null
$queries=@("tracerca_llm_request_duration_seconds","tracerca_llm_prompt_tokens","tracerca_llm_completion_tokens","tracerca_llm_prompt_eval_duration_seconds","tracerca_llm_generation_duration_seconds") | ForEach-Object { @{ metric=$_; promql=('{0}{{run_id="{1}"}}' -f $_,$runId) } }
$sync=Post-Json "$api/api/connectors/prometheus/sync" @{ queries=$queries }
$evidence=Post-Json "$api/api/evidence/query" @{ kinds=@("metric"); service="local-llm-demo"; source=@{provider="prometheus"}; limit=500 }
$runEvidence=@($evidence.evidence | Where-Object { $_.attributes.prometheusLabels.run_id -eq $runId })
if ($normal.measurement.promptTokens -eq $null -or $high.measurement.promptTokens -eq $null) { throw "Ollama did not return prompt token measurements." }
if ($high.measurement.promptTokens -le $normal.measurement.promptTokens) { throw "High-context prompt tokens were not greater than normal." }
if ($normal.measurement.duration -eq $null -or $high.measurement.duration -eq $null -or $sync.ingested -le 0 -or $runEvidence.Count -le 0) { throw "Required duration or current-run Prometheus/TraceRCA evidence was missing." }
$mcpEntry = Join-Path $root "services\bob-mcp\build\index.js"
$mcpSource = Join-Path $root "services\bob-mcp\src"
$mcpBuildRequired = -not (Test-Path $mcpEntry)
if (-not $mcpBuildRequired) {
    $mcpBuildTime = (Get-Item $mcpEntry).LastWriteTimeUtc
    $mcpBuildRequired = $null -ne (Get-ChildItem $mcpSource -Recurse -File -Filter "*.ts" | Where-Object { $_.LastWriteTimeUtc -gt $mcpBuildTime } | Select-Object -First 1)
}
if ($mcpBuildRequired) {
    Write-Host "Bob MCP build is missing or stale; running setup-mcp.ps1..." -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot "setup-mcp.ps1")
    if ($LASTEXITCODE -ne 0) { throw "Bob MCP setup failed with exit code $LASTEXITCODE." }
}
node "$root\services\bob-mcp\scripts\evidence-rca-acceptance.mjs" $runId $normal.measurement.promptTokens $normal.measurement.duration $high.measurement.promptTokens $high.measurement.duration; if ($LASTEXITCODE -ne 0) { throw "Bob current-run evidence RCA acceptance failed." }
Write-Host "`nModel: $model" -ForegroundColor Cyan
Write-Host "Run ID: $runId" -ForegroundColor Cyan
Write-Host ("{0,-16} {1,12} {2,16:N3}s" -f "Workload","Prompt tokens","Request duration")
Write-Host ("{0,-16} {1,12} {2,16:N3}s" -f "NORMAL",$normal.measurement.promptTokens,$normal.measurement.duration)
Write-Host ("{0,-16} {1,12} {2,16:N3}s" -f "HIGH CONTEXT",$high.measurement.promptTokens,$high.measurement.duration)
Write-Host "Prometheus samples collected: $($sync.samples)"; Write-Host "TraceRCA EvidenceMetric records ingested: $($sync.ingested)"; Write-Host "PASS" -ForegroundColor Green
