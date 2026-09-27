# TraceRCA End-to-End Smoke Test Script
# Validates service health, dashboard responsiveness, live API endpoints,
# and the semantic correctness of the most recent incident and replay record.
#
# Run after .\scripts\prepare-demo.ps1 to confirm the full demo scenario is valid.
#
# Exit codes:
#   0 - all assertions passed
#   1 - one or more assertions failed

$ErrorActionPreference = "Continue"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "TraceRCA Smoke Test Suite" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$passed = 0
$failed = 0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Assert-Endpoint {
    param (
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$ExpectedProps = $null
    )

    Write-Host -NoNewline "  $Name ... "
    try {
        $resp = Invoke-RestMethod -Uri $Url -Method $Method -TimeoutSec 5

        $valid = $true
        if ($null -ne $ExpectedProps) {
            foreach ($key in $ExpectedProps.Keys) {
                if ($resp.$key -ne $ExpectedProps[$key]) {
                    $valid = $false
                    break
                }
            }
        }

        if ($valid) {
            Write-Host "[PASS]" -ForegroundColor Green
            $script:passed++
            return $resp
        } else {
            Write-Host "[FAIL] (property mismatch)" -ForegroundColor Red
            $script:failed++
            return $null
        }
    } catch {
        Write-Host "[FAIL] ($($_.Exception.Message))" -ForegroundColor Red
        $script:failed++
        return $null
    }
}

function Assert-HttpOk {
    param ([string]$Name, [string]$Url)
    Write-Host -NoNewline "  $Name ... "
    try {
        $resp = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -TimeoutSec 5
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
            Write-Host "[PASS] (HTTP $($resp.StatusCode))" -ForegroundColor Green
            $script:passed++
            return $true
        } else {
            Write-Host "[FAIL] (HTTP $($resp.StatusCode))" -ForegroundColor Red
            $script:failed++
            return $false
        }
    } catch {
        Write-Host "[FAIL] ($($_.Exception.Message))" -ForegroundColor Red
        $script:failed++
        return $false
    }
}

function Assert-True {
    param ([string]$Name, [bool]$Condition, [string]$Detail = "")
    Write-Host -NoNewline "  $Name ... "
    if ($Condition) {
        Write-Host "[PASS]" -ForegroundColor Green
        $script:passed++
    } else {
        $suffix = if ($Detail) { " ($Detail)" } else { "" }
        Write-Host "[FAIL]$suffix" -ForegroundColor Red
        $script:failed++
    }
}

# ---------------------------------------------------------------------------
# Section 1: Service Health
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Service Health Checks ---" -ForegroundColor Yellow

$null = Assert-HttpOk    -Name "Dashboard             (:3000)" -Url "http://localhost:3000"
$null = Assert-Endpoint  -Name "TraceRCA API          (:4004)" -Url "http://localhost:4004/health" -ExpectedProps @{ status = "ok"; service = "tracerca-api" }
$null = Assert-Endpoint  -Name "Provider Simulator    (:4001)" -Url "http://localhost:4001/health" -ExpectedProps @{ status = "ok" }
$null = Assert-Endpoint  -Name "Incident Engine       (:4002)" -Url "http://localhost:4002/health" -ExpectedProps @{ status = "ok" }
$null = Assert-Endpoint  -Name "Replay Engine         (:4003)" -Url "http://localhost:4003/health" -ExpectedProps @{ status = "ok" }
$null = Assert-Endpoint  -Name "Demo AI App           (:3001)" -Url "http://localhost:3001/health" -ExpectedProps @{ status = "ok" }

# ---------------------------------------------------------------------------
# Section 2: API Collection Endpoints
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "--- API Collection Endpoints ---" -ForegroundColor Yellow

$incidentsResp = Assert-Endpoint -Name "GET /api/incidents"         -Url "http://localhost:4004/api/incidents"
$telemetryResp = Assert-Endpoint -Name "GET /api/telemetry/summary" -Url "http://localhost:4004/api/telemetry/summary"
$replaysResp   = Assert-Endpoint -Name "GET /api/replays"           -Url "http://localhost:4004/api/replays"

# ---------------------------------------------------------------------------
# Section 3: Incident Existence and Detail Routes
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Incident Detail Routes ---" -ForegroundColor Yellow

if ($null -ne $incidentsResp -and $incidentsResp.incidents.Count -gt 0) {
    $latestIncidentId = $incidentsResp.incidents[0].id
    $incidentDetail   = Assert-Endpoint -Name "GET /api/incidents/$latestIncidentId"         -Url "http://localhost:4004/api/incidents/$latestIncidentId"
    $incidentEvents   = Assert-Endpoint -Name "GET /api/incidents/$latestIncidentId/events"  -Url "http://localhost:4004/api/incidents/$latestIncidentId/events"
    $incidentMetrics  = Assert-Endpoint -Name "GET /api/incidents/$latestIncidentId/metrics" -Url "http://localhost:4004/api/incidents/$latestIncidentId/metrics"

    # Dashboard incident page
    $null = Assert-HttpOk -Name "Dashboard /incidents/$latestIncidentId" -Url "http://localhost:3000/incidents/$latestIncidentId"
} else {
    Write-Host "  (No incidents found - run prepare-demo.ps1 first)" -ForegroundColor DarkGray
    $incidentDetail  = $null
    $incidentMetrics = $null
}

# ---------------------------------------------------------------------------
# Section 4: Replay Existence and Detail Routes
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Replay Detail Routes ---" -ForegroundColor Yellow

if ($null -ne $replaysResp -and $replaysResp.replays.Count -gt 0) {
    $latestReplayId = $replaysResp.replays[0].id
    $replayDetail   = Assert-Endpoint -Name "GET /api/replays/$latestReplayId" -Url "http://localhost:4004/api/replays/$latestReplayId"

    # Dashboard replay page
    $null = Assert-HttpOk -Name "Dashboard /replays/$latestReplayId" -Url "http://localhost:3000/replays/$latestReplayId"
} else {
    Write-Host "  (No replays found - run prepare-demo.ps1 first)" -ForegroundColor DarkGray
    $replayDetail = $null
}

# ---------------------------------------------------------------------------
# Section 5: Incident Semantic Assertions
# Verify the incident contains the expected 429 / retry / fallback evidence.
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Incident Semantic Assertions ---" -ForegroundColor Yellow

if ($null -ne $incidentMetrics -and $null -ne $incidentDetail) {

    # 429 evidence: at least 2 HTTP 429 responses from Provider A
    Assert-True -Name "provider429Count >= 2" `
        -Condition ($incidentMetrics.provider429Count -ge 2) `
        -Detail    "provider429Count=$($incidentMetrics.provider429Count)"

    # Retry evidence: at least 2 retries were scheduled
    Assert-True -Name "retryCount >= 2" `
        -Condition ($incidentMetrics.retryCount -ge 2) `
        -Detail    "retryCount=$($incidentMetrics.retryCount)"

    # Fallback evidence: fallback to Provider B was used
    Assert-True -Name "fallbackCount >= 1" `
        -Condition ($incidentMetrics.fallbackCount -ge 1) `
        -Detail    "fallbackCount=$($incidentMetrics.fallbackCount)"

    # Provider B completed the request
    Assert-True -Name "finalProvider = B" `
        -Condition ($incidentMetrics.finalProvider -eq "B") `
        -Detail    "finalProvider=$($incidentMetrics.finalProvider)"

    # Event timeline contains router.retry_scheduled events with retryDelayMs
    if ($null -ne $incidentEvents -and $incidentEvents.events) {
        $retryEvts = $incidentEvents.events | Where-Object { $_.type -eq "router.retry_scheduled" }
        Assert-True -Name "Timeline has >= 2 router.retry_scheduled events" `
            -Condition ($retryEvts.Count -ge 2) `
            -Detail    "found=$($retryEvts.Count)"

        $hasDelays = ($retryEvts | Where-Object { $_.retryDelayMs -gt 0 }).Count -gt 0
        Assert-True -Name "router.retry_scheduled events carry retryDelayMs > 0" `
            -Condition $hasDelays `
            -Detail    "retryDelayMs values: $(($retryEvts | Select-Object -ExpandProperty retryDelayMs) -join ', ')"
    } else {
        Write-Host "  (Skipping timeline assertions - events not available)" -ForegroundColor DarkGray
    }

} else {
    Write-Host "  (Skipping incident semantic assertions - incident data not available)" -ForegroundColor DarkGray
}

# ---------------------------------------------------------------------------
# Section 6: Replay Semantic Assertions
# Verify the replay proves the candidate genuinely outperforms the baseline.
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "--- Replay Semantic Assertions ---" -ForegroundColor Yellow

if ($null -ne $replayDetail) {

    # Both runs must have completed successfully
    Assert-True -Name "baseline.success = true" `
        -Condition ($replayDetail.baseline.success -eq $true) `
        -Detail    "baseline.success=$($replayDetail.baseline.success)"

    Assert-True -Name "candidate.success = true" `
        -Condition ($replayDetail.candidate.success -eq $true) `
        -Detail    "candidate.success=$($replayDetail.candidate.success)"

    # Both runs must have completed via Provider B (fallback preserved)
    Assert-True -Name "baseline.finalProvider = B" `
        -Condition ($replayDetail.baseline.finalProvider -eq "B") `
        -Detail    "baseline.finalProvider=$($replayDetail.baseline.finalProvider)"

    Assert-True -Name "candidate.finalProvider = B" `
        -Condition ($replayDetail.candidate.finalProvider -eq "B") `
        -Detail    "candidate.finalProvider=$($replayDetail.candidate.finalProvider)"

    # Candidate must use fewer retries than baseline
    Assert-True -Name "candidate.retryCount < baseline.retryCount" `
        -Condition ($replayDetail.candidate.retryCount -lt $replayDetail.baseline.retryCount) `
        -Detail    "baseline=$($replayDetail.baseline.retryCount) candidate=$($replayDetail.candidate.retryCount)"

    # Candidate must be faster than baseline
    Assert-True -Name "candidate.latencyMs < baseline.latencyMs" `
        -Condition ($replayDetail.candidate.totalLatencyMs -lt $replayDetail.baseline.totalLatencyMs) `
        -Detail    "baseline=$($replayDetail.baseline.totalLatencyMs)ms candidate=$($replayDetail.candidate.totalLatencyMs)ms"

    # The deterministic verification gate must have passed
    Assert-True -Name "verified = true" `
        -Condition ($replayDetail.verified -eq $true) `
        -Detail    "verified=$($replayDetail.verified)"

} else {
    Write-Host "  (Skipping replay semantic assertions - replay data not available)" -ForegroundColor DarkGray
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
} else {
    exit 0
}
