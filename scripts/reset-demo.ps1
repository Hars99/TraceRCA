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

function Wait-HttpReady {
    param (
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Url,
        [switch]$Html,
        [int]$TimeoutSec = 30,
        [int]$RetryDelaySec = 1
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    $attempt = 0
    $lastError = "no response"

    do {
        $attempt++
        try {
            if ($Html) {
                $response = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
                if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                    Write-Host "  OK  $Name ready after $attempt attempt(s)." -ForegroundColor Green
                    return $true
                }
                $lastError = "HTTP $($response.StatusCode)"
            } else {
                $response = Invoke-RestMethod -Uri $Url -Method GET -TimeoutSec 3 -ErrorAction Stop
                if ($response -and $response.status -eq "ok") {
                    Write-Host "  OK  $Name ready after $attempt attempt(s)." -ForegroundColor Green
                    return $true
                }
                $lastError = "unexpected health response"
            }
        } catch {
            # Connection-reset/closed and other startup transport failures are
            # transient while docker compose restart is still replacing services.
            $lastError = $_.Exception.Message
        }

        if ((Get-Date) -lt $deadline) {
            Start-Sleep -Seconds $RetryDelaySec
        }
    } while ((Get-Date) -lt $deadline)

    Write-Host "  FAIL  $Name did not become ready within ${TimeoutSec}s: $lastError" -ForegroundColor Red
    return $false
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "TraceRCA Demo Reset" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# Step 1: Verify docker is available
# ---------------------------------------------------------------------------
Write-Host "`n[1/4] Checking Docker availability..." -ForegroundColor Yellow

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
Write-Host "`n[2/4] Restarting containers to clear in-memory state..." -ForegroundColor Yellow

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
# Step 3: Wait for every required service independently
# ---------------------------------------------------------------------------
Write-Host "`n[3/4] Waiting for all services to become ready..." -ForegroundColor Yellow

$serviceChecks = @(
    @{ name = "Provider Simulator (:4001)"; url = "http://localhost:4001/health" },
    @{ name = "Incident Engine    (:4002)"; url = "http://localhost:4002/health" },
    @{ name = "Replay Engine      (:4003)"; url = "http://localhost:4003/health" },
    @{ name = "Demo AI App        (:3001)"; url = "http://localhost:3001/health" },
    @{ name = "TraceRCA API       (:4004)"; url = "http://localhost:4004/health" },
    @{ name = "Dashboard          (:3000)"; url = "http://localhost:3000"; html = $true }
)

$allHealthy = $true
foreach ($svc in $serviceChecks) {
    if (-not (Wait-HttpReady -Name $svc.name -Url $svc.url -Html:([bool]$svc.html))) {
        $allHealthy = $false
    }
}

if (-not $allHealthy) {
    Write-Error "One or more services did not become ready after reset. Check container logs."
    exit 1
}

# ---------------------------------------------------------------------------
# Step 4: All services are ready; assert clean state
# ---------------------------------------------------------------------------
Write-Host "`n[4/4] Asserting clean post-reset state..." -ForegroundColor Yellow

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
