# TraceRCA Start Script
# Ensures the Bob MCP server is built, then builds and starts all TraceRCA
# containers via Docker Compose and waits for the API to become healthy.
#
# Normal user/judge flow:
#   .\scripts\start-demo.ps1      ← handles MCP build + Docker startup
#   .\scripts\prepare-demo.ps1    ← seeds incident and replay demo data
#
# For manual MCP rebuild only:
#   .\scripts\setup-mcp.ps1

$ErrorActionPreference = "Stop"

$mcpEntry    = Join-Path $PSScriptRoot "..\services\bob-mcp\build\index.js"
$mcpDir      = Join-Path $PSScriptRoot "..\services\bob-mcp"
$setupScript = Join-Path $PSScriptRoot "setup-mcp.ps1"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Starting TraceRCA Stack" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# Phase 0: MCP build — missing or stale check
#
# Rebuild when any of the following is true:
#   (a) build/index.js does not exist
#   (b) any source file newer than build/index.js
#       — src/**/*.ts, tsconfig.json, package.json, package-lock.json
# ---------------------------------------------------------------------------
Write-Host "`n[Phase 0] Checking Bob MCP server build..." -ForegroundColor Yellow

$needsBuild = $false

if (-not (Test-Path $mcpEntry)) {
    Write-Host "  build/index.js not found - build required." -ForegroundColor Yellow
    $needsBuild = $true
} else {
    $buildTime = (Get-Item $mcpEntry).LastWriteTime

    # Collect source files that should trigger a rebuild when changed
    $watchPaths = @(
        (Join-Path $mcpDir "src"),
        (Join-Path $mcpDir "tsconfig.json"),
        (Join-Path $mcpDir "package.json"),
        (Join-Path $mcpDir "package-lock.json")
    )

    foreach ($watchPath in $watchPaths) {
        if (-not (Test-Path $watchPath)) { continue }

        $newerFiles = Get-ChildItem -Path $watchPath -Recurse -File -ErrorAction SilentlyContinue |
                      Where-Object { $_.LastWriteTime -gt $buildTime }

        if ($newerFiles) {
            $firstName = $newerFiles[0].Name
            Write-Host "  Stale build detected ($firstName is newer than build/index.js) - rebuild required." -ForegroundColor Yellow
            $needsBuild = $true
            break
        }
    }

    if (-not $needsBuild) {
        Write-Host "  build/index.js is up to date." -ForegroundColor Green
    }
}

if ($needsBuild) {
    Write-Host "  Invoking setup-mcp.ps1..." -ForegroundColor Yellow
    & $setupScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error "MCP setup failed (exit code $LASTEXITCODE). Fix the error above before starting the stack."
        exit $LASTEXITCODE
    }
}

# ---------------------------------------------------------------------------
# Phase 1: Build and start containers
# ---------------------------------------------------------------------------
Write-Host "`n[Phase 1] Building and launching containers in background..." -ForegroundColor Yellow

# Pre-check: docker must be available and daemon must be responding
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "docker is not available on PATH. Install Docker Desktop, ensure it is running, and retry."
    exit 1
}
$dockerCheck = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker daemon is not responding. Start Docker Desktop and retry.`n$dockerCheck"
    exit 1
}

docker compose up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker Compose failed to start containers."
    exit $LASTEXITCODE
}

# ---------------------------------------------------------------------------
# Phase 2: Wait for TraceRCA API health
# ---------------------------------------------------------------------------
$healthUrl   = "http://localhost:4004/health"
$maxAttempts = 30
$delaySec    = 2
$healthy     = $false

Write-Host "`n[Phase 2] Waiting for TraceRCA API ($healthUrl) to become healthy..." -ForegroundColor Yellow

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

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "TraceRCA Stack is Ready!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Next Step: Generate demo data deterministically by running:"
Write-Host "  .\scripts\prepare-demo.ps1" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan
