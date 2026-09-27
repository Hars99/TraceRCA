# TraceRCA Demo Reset Script
# Restarts all containers to wipe in-memory incident/replay/telemetry state,
# then verifies that the stack is clean and ready for a fresh demo run.
#
# Use before every demo run to guarantee INC-001 / RPL-001 on each presentation.
#
# Usage:
#   .\scripts\reset-demo.ps1
#   .\scripts\prepare-demo.ps1
#
# Exit codes:
#   0 - stack is healthy, state is clean, Provider A is normal
#   1 - docker unavailable, restart failed, health check timed out,
#       stale state detected, or post-reset assertion failed

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "TraceRCA Demo Reset" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# Step 1: Verify docker is available
# ---------------------------------------------------------------------------
Write-Host "`n[1/5] Checking Docker availability..." -ForegroundColor Yellow

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "docker is not available on PATH. Ensure Docker Desktop is running and retry."
    exit 1
}
$dockerVersion = (docker version --format "{{.Server.Version}}" 2>&1)
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker daemon is not responding. Start Docker Desktop and retry."
    exit 1
}
Write-Host "  Docker $dockerVersion is available." -ForegroundColor Green

# ---------------------------------------------------------------------------
# Step 2: Restart containers (wipes all in-memory state)
# ---------------------------------------------------------------------------
Write-Host "`n[2/5] Restarting containers to clear in-memory state..." -ForegroundColor Yellow

# docker compose writes progress to stderr; temporarily set Continue so those lines
# don't trip $ErrorActionPreference = "Stop" before we can check $LASTEXITCODE.
$ErrorActionPreference = "Continue"
$restartOutput = docker compose restart 2>&1
$restartExit   = $LASTEXITCODE
$ErrorActionPreference = "Stop"
$restartOutput | ForEach-Object { Write-Host "  $_" }

if ($restartExit -ne 0) {
    Write-Error "docker compose restart failed (exit code $restartExit)."
    exit 1
}
Write-Host "  Containers restarted." -ForegroundColor Green

# ---------------------------------------------------------------------------
# Step 3: Wait for TraceRCA API to become healthy
# ---------------------------------------------------------------------------
Write-Host "`n[3/5] Waiting for TraceRCA API to become healthy..." -ForegroundColor Yellow

$healthUrl   = "http://localhost:4004/health"
$maxAttempts = 30
$delaySec    = 2
$healthy     = $false

for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
        $resp = Invoke-RestMethod -Uri $healthUrl -Method GET -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($resp -and $resp.status -eq "ok") {
            $healthy = $true
            Write-Host "  API healthy after $i attempt(s)." -ForegroundColor Green
            break
        }
    } catch { }
    Write-Host "  ... waiting ($i/$maxAttempts)"
    Start-Sleep -Seconds $delaySec
}

if (-not $healthy) {
    Write-Error "TraceRCA API did not become healthy within $($maxAttempts * $delaySec)s after restart."
    exit 1
}

# ---------------------------------------------------------------------------
# Step 4: Verify all required services healthy and dashboard responds
# ---------------------------------------------------------------------------
Write-Host "`n[4/5] Verifying all services and dashboard..." -ForegroundColor Yellow

$serviceChecks = @(
    @{ name = "Provider Simulator (:4001)"; url = "http://localhost:4001/health" },
    @{ name = "Incident Engine    (:4002)"; url = "http://localhost:4002/health" },
    @{ name = "Replay Engine      (:4003)"; url = "http://localhost:4003/health" },
    @{ name = "Demo AI App        (:3001)"; url = "http://localhost:3001/health" }
)

$allHealthy = $true
foreach ($svc in $serviceChecks) {
    try {
        $r = Invoke-RestMethod -Uri $svc.url -Method GET -TimeoutSec 5
        if ($r.status -eq "ok") {
            Write-Host "  OK  $($svc.name)" -ForegroundColor Green
        } else {
            Write-Host "  FAIL  $($svc.name) status=$($r.status)" -ForegroundColor Red
            $allHealthy = $false
        }
    } catch {
        Write-Host "  FAIL  $($svc.name) unreachable: $($_.Exception.Message)" -ForegroundColor Red
        $allHealthy = $false
    }
}

# Dashboard (HTML, not JSON)
try {
    $dashResp = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5
    if ($dashResp.StatusCode -ge 200 -and $dashResp.StatusCode -lt 400) {
        Write-Host "  OK  Dashboard         (:3000)  HTTP $($dashResp.StatusCode)" -ForegroundColor Green
    } else {
        Write-Host "  FAIL  Dashboard HTTP $($dashResp.StatusCode)" -ForegroundColor Red
        $allHealthy = $false
    }
} catch {
    Write-Host "  FAIL  Dashboard unreachable: $($_.Exception.Message)" -ForegroundColor Red
    $allHealthy = $false
}

if (-not $allHealthy) {
    Write-Error "One or more services are not healthy after reset. Check container logs."
    exit 1
}

# ---------------------------------------------------------------------------
# Step 5: Assert clean state
# ---------------------------------------------------------------------------
Write-Host "`n[5/5] Asserting clean post-reset state..." -ForegroundColor Yellow

$stateOk = $true

# Provider A must be back to normal (containers restart with default state)
try {
    $simHealth = Invoke-RestMethod -Uri "http://localhost:4001/health" -TimeoutSec 5
    $providerAMode = $simHealth.modes.A
    if ($providerAMode -eq "normal") {
        Write-Host "  OK  Provider A mode = normal" -ForegroundColor Green
    } else {
        Write-Host "  FAIL  Provider A mode = $providerAMode (expected normal)" -ForegroundColor Red
        $stateOk = $false
    }
} catch {
    Write-Host "  FAIL  Could not read Provider A mode: $($_.Exception.Message)" -ForegroundColor Red
    $stateOk = $false
}

# Incident store must be empty
try {
    $incidents = Invoke-RestMethod -Uri "http://localhost:4004/api/incidents" -TimeoutSec 5
    if ($incidents.count -eq 0) {
        Write-Host "  OK  Incident store is empty" -ForegroundColor Green
    } else {
        Write-Host "  FAIL  Incident store has $($incidents.count) record(s) (expected 0)" -ForegroundColor Red
        $stateOk = $false
    }
} catch {
    Write-Host "  FAIL  Could not read incidents: $($_.Exception.Message)" -ForegroundColor Red
    $stateOk = $false
}

# Replay store must be empty
try {
    $replays = Invoke-RestMethod -Uri "http://localhost:4004/api/replays" -TimeoutSec 5
    if ($replays.count -eq 0) {
        Write-Host "  OK  Replay store is empty" -ForegroundColor Green
    } else {
        Write-Host "  FAIL  Replay store has $($replays.count) record(s) (expected 0)" -ForegroundColor Red
        $stateOk = $false
    }
} catch {
    Write-Host "  FAIL  Could not read replays: $($_.Exception.Message)" -ForegroundColor Red
    $stateOk = $false
}

if (-not $stateOk) {
    Write-Error "Post-reset state assertions failed. The demo is not in a clean state."
    exit 1
}

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "Reset complete. Stack is clean and ready." -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Next step:"
Write-Host "  .\scripts\prepare-demo.ps1" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan
