# TraceRCA End-to-End Smoke Test Script
# Validates the health of all services, dashboard responsiveness, and live API endpoints.

$ErrorActionPreference = "Continue"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "TraceRCA Smoke Test Suite" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$passed = 0
$failed = 0

function Assert-Endpoint {
    param (
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$ExpectedProps = $null
    )

    Write-Host -NoNewline "Checking $Name ($Url)... "
    try {
        $resp = Invoke-RestMethod -Uri $Url -Method $Method -TimeoutSec 5

        $valid = $true
        if ($null -ne $ExpectedProps) {
            foreach ($key in $ExpectedProps.Keys) {
                $expectedVal = $ExpectedProps[$key]
                $actualVal = $resp.$key
                if ($actualVal -ne $expectedVal) {
                    $valid = $false
                    break
                }
            }
        }

        if ($valid) {
            Write-Host "[PASS]" -ForegroundColor Green
            $script:passed++
            return $resp
        }
        else {
            Write-Host "[FAIL] (Property mismatch)" -ForegroundColor Red
            $script:failed++
            return $null
        }
    }
    catch {
        Write-Host "[FAIL] ($($_.Exception.Message))" -ForegroundColor Red
        $script:failed++
        return $null
    }
}

function Assert-HttpOk {
    param (
        [string]$Name,
        [string]$Url
    )

    Write-Host -NoNewline "Checking $Name ($Url)... "
    try {
        $resp = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -TimeoutSec 5
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
            Write-Host "[PASS] (HTTP $($resp.StatusCode))" -ForegroundColor Green
            $script:passed++
            return $true
        }
        else {
            Write-Host "[FAIL] (HTTP $($resp.StatusCode))" -ForegroundColor Red
            $script:failed++
            return $false
        }
    }
    catch {
        Write-Host "[FAIL] ($($_.Exception.Message))" -ForegroundColor Red
        $script:failed++
        return $false
    }
}

# ---------------------------------------------------------------------------
# 1. Service Health Checks
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Service Health Checks ---" -ForegroundColor Yellow

$null = Assert-HttpOk -Name "Dashboard" -Url "http://localhost:3000"
$null = Assert-Endpoint -Name "TraceRCA API Health" -Url "http://localhost:4004/health" -ExpectedProps @{ status = "ok"; service = "tracerca-api" }
$null = Assert-Endpoint -Name "Provider Simulator Health" -Url "http://localhost:4001/health" -ExpectedProps @{ status = "ok" }
$null = Assert-Endpoint -Name "Incident Engine Health" -Url "http://localhost:4002/health" -ExpectedProps @{ status = "ok" }
$null = Assert-Endpoint -Name "Replay Engine Health" -Url "http://localhost:4003/health" -ExpectedProps @{ status = "ok" }
$null = Assert-Endpoint -Name "Demo AI App Health" -Url "http://localhost:3001/health" -ExpectedProps @{ status = "ok" }

# ---------------------------------------------------------------------------
# 2. Live API Validation
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Live API Verification ---" -ForegroundColor Yellow

$incidentsResp = Assert-Endpoint -Name "Incidents API (/api/incidents)" -Url "http://localhost:4004/api/incidents"
$telemetryResp = Assert-Endpoint -Name "Telemetry Summary (/api/telemetry/summary)" -Url "http://localhost:4004/api/telemetry/summary"
$replaysResp = Assert-Endpoint -Name "Replays API (/api/replays)" -Url "http://localhost:4004/api/replays"

# ---------------------------------------------------------------------------
# 3. Conditional Detail Validation (if records exist)
# ---------------------------------------------------------------------------
if ($null -ne $incidentsResp -and $null -ne $incidentsResp.incidents -and $incidentsResp.incidents.Count -gt 0) {
    Write-Host ""
    Write-Host "--- Incident Detail Verification ---" -ForegroundColor Yellow
    $firstIncidentId = $incidentsResp.incidents[0].id
    $null = Assert-Endpoint -Name "Incident Detail (/api/incidents/$firstIncidentId)" -Url "http://localhost:4004/api/incidents/$firstIncidentId"
    $null = Assert-Endpoint -Name "Incident Events (/api/incidents/$firstIncidentId/events)" -Url "http://localhost:4004/api/incidents/$firstIncidentId/events"
    $null = Assert-Endpoint -Name "Incident Metrics (/api/incidents/$firstIncidentId/metrics)" -Url "http://localhost:4004/api/incidents/$firstIncidentId/metrics"
}
else {
    Write-Host ""
    Write-Host "(No incident records found to test detail routes - run .\scripts\prepare-demo.ps1 to populate)" -ForegroundColor DarkGray
}

if ($null -ne $replaysResp -and $null -ne $replaysResp.replays -and $replaysResp.replays.Count -gt 0) {
    Write-Host ""
    Write-Host "--- Replay Detail Verification ---" -ForegroundColor Yellow
    $firstReplayId = $replaysResp.replays[0].id
    $null = Assert-Endpoint -Name "Replay Detail (/api/replays/$firstReplayId)" -Url "http://localhost:4004/api/replays/$firstReplayId"
}
else {
    Write-Host ""
    Write-Host "(No replay records found to test detail routes - run .\scripts\prepare-demo.ps1 to populate)" -ForegroundColor DarkGray
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
$summaryColor = if ($failed -eq 0) { "Green" } else { "Red" }
Write-Host "Smoke Test Summary: $passed Passed, $failed Failed" -ForegroundColor $summaryColor
Write-Host "==================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
else {
    exit 0
}

