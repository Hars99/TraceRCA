# TraceRCA Start Script
# Builds and starts all TraceRCA containers via Docker Compose and waits for the API to become healthy.

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Starting TraceRCA Stack via Docker Compose" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Start containers
Write-Host "`nBuilding and launching containers in background..." -ForegroundColor Yellow
docker compose up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker Compose failed to start containers."
    exit $LASTEXITCODE
}

# Wait for tracerca-api to become healthy
$healthUrl = "http://localhost:4004/health"
$maxAttempts = 30
$delaySec = 2
$healthy = $false

Write-Host "`nWaiting for TraceRCA API ($healthUrl) to become healthy..." -ForegroundColor Yellow

for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
        $resp = Invoke-RestMethod -Uri $healthUrl -Method GET -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($resp -and $resp.status -eq "ok") {
            $healthy = $true
            Write-Host "TraceRCA API is healthy! (attempt $i/$maxAttempts)" -ForegroundColor Green
            break
        }
    }
    catch {
        # Keep waiting
    }
    Write-Host "  ... waiting for API to become ready (attempt $i/$maxAttempts)"
    Start-Sleep -Seconds $delaySec
}

if (-not $healthy) {
    Write-Error "TraceRCA API did not become healthy within $($maxAttempts * $delaySec) seconds."
    exit 1
}

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "TraceRCA Stack is Ready!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Next Step: Generate demo data deterministically by running:"
Write-Host "  .\scripts\prepare-demo.ps1" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan

