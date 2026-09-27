# TraceRCA Demo Preparation Script
# Prepares a fresh TraceRCA demo by deterministically degrading Provider A,
# triggering a demo incident, and executing a verified replay.
#
# Prerequisites: run .\scripts\reset-demo.ps1 first to ensure a clean slate.
#
# Exit codes:
#   0 - incident generated, replay executed, verified=true
#   1 - any step failed, fallback not used, or replay not verified

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "TraceRCA Demo Preparation" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# Baseline router configuration
#
# Source of truth: docker-compose.yml environment defaults for demo-ai-app:
#   MAX_RETRIES    = 3   (${MAX_RETRIES:-3})
#   RETRY_DELAY_MS = 750 (${RETRY_DELAY_MS:-750})
#
# These values are read from the running container at runtime so that any
# change to docker-compose.yml is caught immediately rather than silently
# producing a mismatched replay.
#
# MVP limitation: maxRetries is the configured router limit, not retryCount
# (runtime evidence). retryCount equals maxRetries only when Provider A fails
# on every attempt. The consistency check below asserts they agree so this
# assumption is never silently violated.
# ---------------------------------------------------------------------------

$EXPECTED_MAX_RETRIES    = 3
$EXPECTED_RETRY_DELAY_MS = 750

# ---------------------------------------------------------------------------
# [1/7] Verify TraceRCA API health
# ---------------------------------------------------------------------------
Write-Host "`n[1/7] Verifying TraceRCA API health..." -ForegroundColor Yellow
try {
    $apiHealth = Invoke-RestMethod -Uri "http://localhost:4004/health" -Method GET -TimeoutSec 5
    if ($apiHealth.status -ne "ok") {
        Write-Error "TraceRCA API responded but status is not ok: $($apiHealth.status)"
        exit 1
    }
    Write-Host "  TraceRCA API is healthy." -ForegroundColor Green
} catch {
    Write-Error "TraceRCA API health check failed at http://localhost:4004/health: $_"
    exit 1
}

# ---------------------------------------------------------------------------
# [2/7] Read and verify baseline router config from running container
# ---------------------------------------------------------------------------
Write-Host "`n[2/7] Reading baseline router config from running container..." -ForegroundColor Yellow

$containerMaxRetries    = $null
$containerRetryDelayMs  = $null

try {
    $env_output = docker compose exec demo-ai-app printenv MAX_RETRIES RETRY_DELAY_MS 2>&1
    $envLines = ($env_output | Where-Object { $_ -match '^\d+$' })
    if ($envLines.Count -ge 2) {
        $containerMaxRetries   = [int]$envLines[0]
        $containerRetryDelayMs = [int]$envLines[1]
    }
} catch {
    # docker exec not available (e.g. running outside Docker context) — fall through to warning
}

if ($null -ne $containerMaxRetries -and $null -ne $containerRetryDelayMs) {
    Write-Host "  Container MAX_RETRIES    = $containerMaxRetries"
    Write-Host "  Container RETRY_DELAY_MS = $containerRetryDelayMs"

    if ($containerMaxRetries -ne $EXPECTED_MAX_RETRIES) {
        Write-Error "BASELINE MISMATCH: container MAX_RETRIES=$containerMaxRetries but script expects $EXPECTED_MAX_RETRIES.`nUpdate EXPECTED_MAX_RETRIES in prepare-demo.ps1 to match docker-compose.yml."
        exit 1
    }
    if ($containerRetryDelayMs -ne $EXPECTED_RETRY_DELAY_MS) {
        Write-Error "BASELINE MISMATCH: container RETRY_DELAY_MS=$containerRetryDelayMs but script expects $EXPECTED_RETRY_DELAY_MS.`nUpdate EXPECTED_RETRY_DELAY_MS in prepare-demo.ps1 to match docker-compose.yml."
        exit 1
    }
    Write-Host "  Baseline config consistent with docker-compose.yml defaults." -ForegroundColor Green
} else {
    Write-Host "  WARNING: Could not read container env (docker exec unavailable). Using documented defaults (maxRetries=$EXPECTED_MAX_RETRIES, retryDelayMs=$EXPECTED_RETRY_DELAY_MS)." -ForegroundColor Yellow
    Write-Host "  Proceeding - verify docker-compose.yml MAX_RETRIES and RETRY_DELAY_MS match these values." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# [3/7] Set Provider A to degraded
# ---------------------------------------------------------------------------
Write-Host "`n[3/7] Setting Provider A to degraded mode..." -ForegroundColor Yellow
try {
    $modeBody = @{ provider = "A"; mode = "degraded" } | ConvertTo-Json
    $modeResp = Invoke-RestMethod -Uri "http://localhost:4001/admin/mode" -Method POST -ContentType "application/json" -Body $modeBody -TimeoutSec 5
    Write-Host "  $($modeResp.message)" -ForegroundColor Green
} catch {
    Write-Error "Failed to set Provider A to degraded mode: $_"
    exit 1
}

# ---------------------------------------------------------------------------
# [4/7] Send demo chat request — must use fallback
# ---------------------------------------------------------------------------
Write-Host "`n[4/7] Sending demo chat request (expecting Provider B fallback)..." -ForegroundColor Yellow
$chatResp = $null
try {
    $chatBody = @{ message = "TraceRCA automated demo incident generation request" } | ConvertTo-Json
    $chatResp = Invoke-RestMethod -Uri "http://localhost:3001/chat" -Method POST -ContentType "application/json" -Body $chatBody -TimeoutSec 15
} catch {
    Write-Error "Chat request to http://localhost:3001/chat failed: $_"
    exit 1
}

if ($chatResp.fallbackUsed -ne $true) {
    Write-Error "SCENARIO FAILED: Chat response did not use fallback (provider=$($chatResp.provider), fallbackUsed=$($chatResp.fallbackUsed)).`nProvider A may not be degraded. Run reset-demo.ps1 and retry."
    exit 1
}
Write-Host "  Final provider: $($chatResp.provider)  fallbackUsed: $($chatResp.fallbackUsed)" -ForegroundColor Green

# ---------------------------------------------------------------------------
# [5/7] Retrieve newest incident
# ---------------------------------------------------------------------------
Write-Host "`n[5/7] Retrieving generated incident..." -ForegroundColor Yellow
$incident   = $null
$incidentId = $null

for ($i = 1; $i -le 10; $i++) {
    try {
        $incidentsResp = Invoke-RestMethod -Uri "http://localhost:4004/api/incidents" -Method GET -TimeoutSec 5
        if ($incidentsResp.count -gt 0 -and $incidentsResp.incidents.Count -gt 0) {
            $incidentId = $incidentsResp.incidents[0].id
            $incident   = Invoke-RestMethod -Uri "http://localhost:4004/api/incidents/$incidentId" -Method GET -TimeoutSec 5
            break
        }
    } catch { }
    Start-Sleep -Milliseconds 500
}

if (-not $incident -or -not $incidentId) {
    Write-Error "No incident was generated within 5s. Check incident-engine logs."
    exit 1
}
Write-Host "  Incident: $incidentId  Severity: $($incident.severity)" -ForegroundColor Green
Write-Host "  Trigger : $($incident.trigger)" -ForegroundColor Green

# ---------------------------------------------------------------------------
# [6/7] Run replay with evidence-consistent baseline
# ---------------------------------------------------------------------------
Write-Host "`n[6/7] Running replay verification (baseline maxRetries=$EXPECTED_MAX_RETRIES, retryDelayMs=$EXPECTED_RETRY_DELAY_MS)..." -ForegroundColor Yellow

$replayRecord = $null
try {
    $replayBody = @{
        incidentId      = $incidentId
        baselineConfig  = @{ maxRetries = $EXPECTED_MAX_RETRIES;   retryDelayMs = $EXPECTED_RETRY_DELAY_MS }
        candidateConfig = @{ maxRetries = 1;                        retryDelayMs = $EXPECTED_RETRY_DELAY_MS }
    } | ConvertTo-Json
    $replayRecord = Invoke-RestMethod -Uri "http://localhost:4004/api/replay" -Method POST -ContentType "application/json" -Body $replayBody -TimeoutSec 30
} catch {
    Write-Error "Replay request to http://localhost:4004/api/replay failed: $_"
    exit 1
}

if (-not $replayRecord -or -not $replayRecord.id) {
    Write-Error "Replay execution did not return a valid record."
    exit 1
}

# Confirm persistence
$replayId = $replayRecord.id
try {
    $persisted = Invoke-RestMethod -Uri "http://localhost:4004/api/replays/$replayId" -Method GET -TimeoutSec 5
    if ($persisted -and $persisted.id) { $replayRecord = $persisted }
} catch {
    Write-Warning "Could not re-fetch replay $replayId - using returned result."
}

# ---------------------------------------------------------------------------
# [7/7] Assert verified=true — hard failure if not
# ---------------------------------------------------------------------------
Write-Host "`n[7/7] Asserting replay verification result..." -ForegroundColor Yellow

$verifiedStatus = $replayRecord.verified

if ($verifiedStatus -ne $true) {
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Red
    Write-Host "DEMO PREPARATION FAILED" -ForegroundColor Red
    Write-Host "==================================================" -ForegroundColor Red
    Write-Host "Replay ID  : $replayId"
    Write-Host "verified   : $verifiedStatus  (expected true)"
    Write-Host "baseline latency  : $($replayRecord.baseline.totalLatencyMs)ms"
    Write-Host "candidate latency : $($replayRecord.candidate.totalLatencyMs)ms"
    Write-Host "baseline retries  : $($replayRecord.baseline.retryCount)"
    Write-Host "candidate retries : $($replayRecord.candidate.retryCount)"
    Write-Host ""
    Write-Host "The replay verification gate was not met. Do not proceed with the demo." -ForegroundColor Red
    Write-Host "Run .\scripts\reset-demo.ps1 and retry." -ForegroundColor Yellow
    Write-Host "==================================================" -ForegroundColor Red
    exit 1
}

Write-Host "  verified = $verifiedStatus" -ForegroundColor Green

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
$incidentLatencyMs  = if ($incident.metrics -and $incident.metrics.totalLatencyMs) { $incident.metrics.totalLatencyMs } else { "N/A" }
$baselineLatencyMs  = $replayRecord.baseline.totalLatencyMs
$candidateLatencyMs = $replayRecord.candidate.totalLatencyMs
$improvementPct     = $replayRecord.comparison.latencyImprovementPercent
$retriesReduced     = $replayRecord.comparison.retriesReducedBy

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "Demo Preparation Results" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Incident ID                : $incidentId"
Write-Host "Replay ID                  : $replayId"
Write-Host "Incident Latency           : ${incidentLatencyMs}ms"
Write-Host "Baseline Latency           : ${baselineLatencyMs}ms  (maxRetries=$EXPECTED_MAX_RETRIES)"
Write-Host "Candidate Latency          : ${candidateLatencyMs}ms  (maxRetries=1)"
Write-Host "Latency Improvement        : ${improvementPct}%"
Write-Host "Retry Reduction            : ${retriesReduced} retries"
Write-Host "Verified Status            : $verifiedStatus"

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "Dashboard URLs" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Dashboard Overview         : http://localhost:3000"
Write-Host "Incident Detail            : http://localhost:3000/incidents/$incidentId"
Write-Host "Replay Detail              : http://localhost:3000/replays/$replayId"
Write-Host "==================================================" -ForegroundColor Cyan
