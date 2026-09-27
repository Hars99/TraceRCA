# TraceRCA Evidence Layer acceptance test.
# Run after reset-demo.ps1 and prepare-demo.ps1 while the demo stack is running.

$ErrorActionPreference = "Stop"
$api = "http://localhost:4004"

function Assert-True([string]$Name, [bool]$Condition) {
  if (-not $Condition) { throw "FAILED: $Name" }
  Write-Host "PASS: $Name" -ForegroundColor Green
}

$incidentList = Invoke-RestMethod -Method Get -Uri "$api/api/incidents" -TimeoutSec 5
Assert-True "existing incident is available" ($incidentList.count -gt 0)
$incidentId = $incidentList.incidents[0].id
$incidentEvidence = Invoke-RestMethod -Method Get -Uri "$api/api/incidents/$incidentId/evidence" -TimeoutSec 5
$has429 = @($incidentEvidence.evidence | Where-Object { $_.kind -eq "event" -and $_.eventType -eq "provider.response" -and $_.status -eq 429 }).Count -gt 0
Assert-True "telemetry 429 was normalized as evidence" $has429

$now = [DateTime]::UtcNow
$metricTime = $now.ToString("o")
$changeTime = $now.AddSeconds(1).ToString("o")
$common = @{ source = @{ category = "llm"; provider = "ollama"; connector = "acceptance" }; origin = @{ kind = "pipeline"; actor = "evidence-acceptance" }; assertion = "observed"; provenance = @{ connector = "acceptance"; sourceRecordId = "metric-$([guid]::NewGuid())"; originalTimestamp = $metricTime }; correlation = @{ service = "local-llm-api"; environment = "development" } }
$metric = $common.Clone(); $metric.kind = "metric"; $metric.timestamp = $metricTime; $metric.metric = "gpu.utilization"; $metric.value = 97; $metric.unit = "percent"
$change = @{ kind = "change"; timestamp = $changeTime; source = @{ category = "deployment"; provider = "github-actions"; connector = "acceptance" }; origin = @{ kind = "pipeline"; actor = "evidence-acceptance" }; assertion = "observed"; provenance = @{ connector = "acceptance"; sourceRecordId = "change-$([guid]::NewGuid())"; originalTimestamp = $changeTime }; correlation = @{ service = "local-llm-api"; environment = "development" }; changeType = "configuration"; entity = "prompt.context_limit"; before = 4096; after = 24576 }

Invoke-RestMethod -Method Post -Uri "$api/api/evidence/metrics" -ContentType "application/json" -Body ($metric | ConvertTo-Json -Depth 8) | Out-Null
Invoke-RestMethod -Method Post -Uri "$api/api/evidence/changes" -ContentType "application/json" -Body ($change | ConvertTo-Json -Depth 8) | Out-Null

$query = @{ kinds = @("metric", "change"); startTime = $now.AddMinutes(-1).ToString("o"); endTime = $now.AddMinutes(1).ToString("o"); service = "local-llm-api"; environment = "development"; limit = 50 }
$result = Invoke-RestMethod -Method Post -Uri "$api/api/evidence/query" -ContentType "application/json" -Body ($query | ConvertTo-Json -Depth 8)
Assert-True "metric and change are returned together" ((@($result.evidence | Where-Object { $_.kind -eq "metric" -and $_.metric -eq "gpu.utilization" }).Count -ge 1) -and (@($result.evidence | Where-Object { $_.kind -eq "change" -and $_.entity -eq "prompt.context_limit" }).Count -ge 1))

node "$PSScriptRoot\..\services\bob-mcp\scripts\evidence-acceptance.mjs" $query.startTime $query.endTime
if ($LASTEXITCODE -ne 0) { throw "FAILED: Bob MCP query_evidence" }
Write-Host "Evidence acceptance passed for $incidentId." -ForegroundColor Cyan
