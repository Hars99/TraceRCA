# TraceRCA Demo Preparation Script
# Prepares a fresh TraceRCA demo after container restart by deterministically
# degrading Provider A, triggering a demo incident, and executing a verified replay.

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "TraceRCA Demo Preparation" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Verify TraceRCA API health
Write-Host "`n[1/6] Verifying TraceRCA API health..." -ForegroundColor Yellow
try {
    $apiHealth = Invoke-RestMethod -Uri "http://localhost:4004/health" -Method GET -TimeoutSec 5
    if ($apiHealth.status -ne "ok") {
        Write-Error "TraceRCA API responded but status is not ok: $($apiHealth.status)"
        exit 1
    }
    Write-Host "TraceRCA API is healthy." -ForegroundColor Green
}
catch {
    Write-Error "TraceRCA API health check failed at http://localhost:4004/health: $_"
    exit 1
}

# 2. Set Provider A to degraded
Write-Host "`n[2/6] Setting Provider A to degraded mode..." -ForegroundColor Yellow
try {
    $modeBody = @{
        provider = "A"
        mode     = "degraded"
    } | ConvertTo-Json
    $modeResp = Invoke-RestMethod -Uri "http://localhost:4001/admin/mode" -Method POST -ContentType "application/json" -Body $modeBody -TimeoutSec 5
    Write-Host "Provider A set to degraded: $($modeResp.message)" -ForegroundColor Green
}
catch {
    Write-Error "Failed to set Provider A to degraded mode: $_"
    exit 1
}

# 3. Send one demo request
Write-Host "`n[3/6] Sending demo chat request..." -ForegroundColor Yellow
try {
    $chatBody = @{
        message = "TraceRCA automated demo incident generation request"
    } | ConvertTo-Json
    $chatResp = Invoke-RestMethod -Uri "http://localhost:3001/chat" -Method POST -ContentType "application/json" -Body $chatBody -TimeoutSec 15
    Write-Host "Chat request completed. Final provider: $($chatResp.provider) (fallbackUsed: $($chatResp.fallbackUsed))" -ForegroundColor Green
}
catch {
    Write-Error "Failed to send chat request to http://localhost:3001/chat: $_"
    exit 1
}

# 4. Retrieve newest incident
Write-Host "`n[4/6] Retrieving newest incident from TraceRCA API..." -ForegroundColor Yellow
$incident = $null
$incidentId = $null
$maxRetries = 10
for ($i = 1; $i -le $maxRetries; $i++) {
    try {
        $incidentsResp = Invoke-RestMethod -Uri "http://localhost:4004/api/incidents" -Method GET -TimeoutSec 5
        if ($incidentsResp.count -gt 0 -and $incidentsResp.incidents.Count -gt 0) {
            $incidentId = $incidentsResp.incidents[0].id
            $incident = Invoke-RestMethod -Uri "http://localhost:4004/api/incidents/$incidentId" -Method GET -TimeoutSec 5
            break
        }
    }
    catch {
        # Retry on transient delay
    }
    Start-Sleep -Milliseconds 500
}

if (-not $incident -or -not $incidentId) {
    Write-Error "Failed to retrieve generated incident from http://localhost:4004/api/incidents"
    exit 1
}
Write-Host "Retrieved incident: $incidentId (Severity: $($incident.severity), Trigger: $($incident.trigger))" -ForegroundColor Green

# 5. Run replay
Write-Host "`n[5/6] Running replay verification on incident $incidentId..." -ForegroundColor Yellow
$replayRecord = $null
try {
    $replayBody = @{
        incidentId      = $incidentId
        baselineConfig  = @{
            maxRetries   = 3
            retryDelayMs = 750
        }
        candidateConfig = @{
            maxRetries   = 1
            retryDelayMs = 750
        }
    } | ConvertTo-Json

    $replayRecord = Invoke-RestMethod -Uri "http://localhost:4004/api/replay" -Method POST -ContentType "application/json" -Body $replayBody -TimeoutSec 30
}
catch {
    Write-Error "Failed to execute replay via http://localhost:4004/api/replay: $_"
    exit 1
}

if (-not $replayRecord -or -not $replayRecord.id) {
    Write-Error "Replay execution did not return a valid replay record."
    exit 1
}

# 6. Retrieve replay record to confirm persistence
$replayId = $replayRecord.id
try {
    $persistedReplay = Invoke-RestMethod -Uri "http://localhost:4004/api/replays/$replayId" -Method GET -TimeoutSec 5
    if ($persistedReplay -and $persistedReplay.id) {
        $replayRecord = $persistedReplay
    }
}
catch {
    Write-Warning "Could not re-fetch replay from /api/replays/$replayId, using returned result."
}

# 7. Print summary metrics
$incidentLatencyMs = if ($incident.metrics -and $incident.metrics.totalLatencyMs) { $incident.metrics.totalLatencyMs } else { "N/A" }
$baselineLatencyMs = $replayRecord.baseline.totalLatencyMs
$candidateLatencyMs = $replayRecord.candidate.totalLatencyMs
$improvementPct = $replayRecord.comparison.latencyImprovementPercent
$retriesReduced = $replayRecord.comparison.retriesReducedBy
$verifiedStatus = $replayRecord.verified

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "Demo Preparation Results" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Incident ID                : $incidentId"
Write-Host "Replay ID                  : $replayId"
Write-Host "Incident Latency           : ${incidentLatencyMs}ms"
Write-Host "Baseline Latency           : ${baselineLatencyMs}ms"
Write-Host "Candidate Latency          : ${candidateLatencyMs}ms"
Write-Host "Latency Improvement        : ${improvementPct}%"
Write-Host "Retry Reduction            : ${retriesReduced} retries"
Write-Host "Verified Status            : $verifiedStatus"

# 8. Print dashboard URLs
Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "Dashboard URLs" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Dashboard Overview         : http://localhost:3000"
Write-Host "Incident Detail            : http://localhost:3000/incidents/$incidentId"
Write-Host "Replay Detail              : http://localhost:3000/replays/$replayId"
Write-Host "==================================================" -ForegroundColor Cyan

