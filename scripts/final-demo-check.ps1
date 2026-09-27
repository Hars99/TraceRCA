# Read-only readiness check for the prepared TraceRCA judge demo.
$ErrorActionPreference = "Stop"
$api = "http://localhost:4004"
$dashboard = "http://localhost:3000"
$prometheusPort = if ($env:PROMETHEUS_PORT) { $env:PROMETHEUS_PORT } else { "9091" }
$prometheus = "http://localhost:$prometheusPort"
$root = Split-Path -Parent $PSScriptRoot
$script:failures = 0
$script:evidence = $null

function Test-Ready([string]$Name, [scriptblock]$Check) {
    Write-Host -NoNewline ($Name.PadRight(26))
    try {
        & $Check | Out-Null
        Write-Host "PASS" -ForegroundColor Green
    } catch {
        $script:failures += 1
        Write-Host "FAIL" -ForegroundColor Red
        Write-Host "  $($_.Exception.Message)" -ForegroundColor DarkRed
    }
}

function Get-Json([string]$Url) { Invoke-RestMethod -Uri $Url -TimeoutSec 8 }
function Get-Http([string]$Url) {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 8
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) { throw "HTTP $($response.StatusCode): $Url" }
    $response
}
function Post-Json([string]$Url, $Body) { Invoke-RestMethod -Uri $Url -Method Post -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 8) -TimeoutSec 8 }

Write-Host ""
Write-Host "TRACERCA FINAL DEMO CHECK" -ForegroundColor Cyan
Write-Host "==========================" -ForegroundColor Cyan

Test-Ready "Docker" {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker is not available on PATH." }
    docker version --format '{{.Server.Version}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Docker daemon is not responding." }
    $required = @("provider-simulator", "incident-engine", "demo-ai-app", "replay-engine", "tracerca-api", "dashboard", "prometheus", "local-llm-demo")
    foreach ($service in $required) {
        $containerId = docker compose -f (Join-Path $root "docker-compose.yml") ps -q $service
        if ($LASTEXITCODE -ne 0 -or -not $containerId) { throw "Required container is not running: $service" }
        $state = docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $containerId
        if ($LASTEXITCODE -ne 0 -or $state -notin @("healthy", "running")) { throw "Container $service state is $state" }
    }
}

Test-Ready "TraceRCA API" {
    $health = Get-Json "$api/health"
    if ($health.status -ne "ok" -or $health.service -ne "tracerca-api") { throw "TraceRCA API health response is invalid." }
}

Test-Ready "Dashboard" {
    foreach ($route in @("/", "/incidents/INC-001", "/replays/RPL-001", "/evidence/local-llm")) { Get-Http "$dashboard$route" | Out-Null }
}

Test-Ready "Incident" {
    $incident = Get-Json "$api/api/incidents/INC-001"
    if ($incident.id -ne "INC-001") { throw "INC-001 was not returned." }
}

Test-Ready "Replay Verification" {
    $replay = Get-Json "$api/api/replays/RPL-001"
    if ($replay.id -ne "RPL-001" -or $replay.verified -ne $true) { throw "RPL-001 is missing or verified is not true." }
}

Test-Ready "Evidence" {
    $script:evidence = Post-Json "$api/api/evidence/query" @{ limit = 500 }
    if ($null -eq $script:evidence.evidence -or $script:evidence.count -le 0) { throw "Generic evidence query returned no records." }
}

Test-Ready "Prometheus" {
    Get-Http "$prometheus/-/ready" | Out-Null
}

Test-Ready "Ollama Evidence" {
    if ($null -eq $script:evidence) { $script:evidence = Post-Json "$api/api/evidence/query" @{ kinds = @("metric"); service = "local-llm-demo"; source = @{ provider = "prometheus" }; limit = 500 } }
    $correlated = @($script:evidence.evidence | ForEach-Object {
        $runId = if ($_.correlation.keys.runId) { $_.correlation.keys.runId } else { $_.attributes.prometheusLabels.run_id }
        if ($runId) { [pscustomobject]@{ RunId = $runId; Evidence = $_ } }
    })
    if ($correlated.Count -eq 0) { throw "No run-correlated Ollama evidence exists." }
    $latest = $correlated | Sort-Object { $_.Evidence.timestamp } -Descending | Select-Object -First 1
    $runRecords = @($correlated | Where-Object { $_.RunId -eq $latest.RunId } | ForEach-Object { $_.Evidence })
    foreach ($workload in @("normal", "high-context")) {
        foreach ($metric in @("tracerca_llm_prompt_tokens", "tracerca_llm_request_duration_seconds")) {
            $match = @($runRecords | Where-Object { $_.kind -eq "metric" -and $_.metric -eq $metric -and $_.attributes.prometheusLabels.workload -eq $workload })
            if ($match.Count -eq 0) { throw "Latest run $($latest.RunId) lacks $metric for $workload." }
        }
    }
}

Test-Ready "Bob MCP" {
    $entry = Join-Path $root "services\bob-mcp\build\index.js"
    if (-not (Test-Path $entry)) { throw "Bob MCP build/index.js is missing." }
    $buildTime = (Get-Item $entry).LastWriteTimeUtc
    $watch = @((Join-Path $root "services\bob-mcp\src"), (Join-Path $root "services\bob-mcp\tsconfig.json"), (Join-Path $root "services\bob-mcp\package.json"), (Join-Path $root "services\bob-mcp\package-lock.json"))
    foreach ($path in $watch) {
        $newer = Get-ChildItem -Path $path -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTimeUtc -gt $buildTime } | Select-Object -First 1
        if ($newer) { throw "Bob MCP build is stale relative to $($newer.Name)." }
    }
}

Write-Host "==========================" -ForegroundColor Cyan
if ($script:failures -gt 0) {
    Write-Host "NOT READY - $($script:failures) check(s) failed" -ForegroundColor Red
    exit 1
}
Write-Host "READY FOR DEMO" -ForegroundColor Green
exit 0
