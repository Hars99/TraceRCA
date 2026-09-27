# TraceRCA MCP Setup Script
# Installs dependencies and builds the Bob MCP server (services/bob-mcp).
#
# This script is the single source of truth for the MCP build.
# It is invoked automatically by start-demo.ps1 when the build is missing or stale.
# Run it directly only when you need to manually rebuild after editing MCP source files.
#
# Usage (manual / debug):
#   .\scripts\setup-mcp.ps1
#
# Exit codes:
#   0 — build succeeded and services/bob-mcp/build/index.js is present
#   1 — node/npm not found, install failed, build failed, or output missing

$ErrorActionPreference = "Stop"

$mcpDir   = Join-Path $PSScriptRoot "..\services\bob-mcp"
$mcpEntry = Join-Path $mcpDir "build\index.js"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "TraceRCA MCP Server Setup" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 1. Verify node and npm are available
# ---------------------------------------------------------------------------
Write-Host "`n[1/3] Checking Node.js and npm availability..." -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "node is not available on PATH. Install Node.js 20+ and retry."
    exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm is not available on PATH. Install Node.js 20+ (includes npm) and retry."
    exit 1
}

$nodeVersion = (node --version 2>&1)
$npmVersion  = (npm --version 2>&1)
Write-Host "  node $nodeVersion  |  npm $npmVersion" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 2. Install dependencies (deterministic: npm ci uses package-lock.json)
# ---------------------------------------------------------------------------
Write-Host "`n[2/3] Installing MCP dependencies (npm ci)..." -ForegroundColor Yellow

Push-Location $mcpDir
try {
    # Redirect stderr to stdout so npm notices/warnings display without triggering
    # PowerShell's error handling. Only $LASTEXITCODE is authoritative.
    $ciOutput = npm ci --prefer-offline 2>&1
    $ciExit   = $LASTEXITCODE
    $ciOutput | ForEach-Object { Write-Host "  $_" }
    if ($ciExit -ne 0) {
        Write-Error "npm ci failed in $mcpDir (exit code $ciExit)."
        exit 1
    }
    Write-Host "  Dependencies installed." -ForegroundColor Green
}
finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# 3. Build TypeScript → build/index.js
# ---------------------------------------------------------------------------
Write-Host "`n[3/3] Building MCP server (npm run build)..." -ForegroundColor Yellow

Push-Location $mcpDir
try {
    $buildOutput = npm run build 2>&1
    $buildExit   = $LASTEXITCODE
    $buildOutput | ForEach-Object { Write-Host "  $_" }
    if ($buildExit -ne 0) {
        Write-Error "npm run build failed in $mcpDir (exit code $buildExit)."
        exit 1
    }
}
finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# 4. Confirm output file exists
# ---------------------------------------------------------------------------
if (-not (Test-Path $mcpEntry)) {
    Write-Error "Build completed but expected output not found: $mcpEntry"
    exit 1
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "MCP server built successfully." -ForegroundColor Green
Write-Host "  Entry: $mcpEntry" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Cyan
