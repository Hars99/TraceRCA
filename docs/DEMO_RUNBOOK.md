# TraceRCA Demo Runbook (3–5 Minute Judge Walkthrough)

This runbook guides presenters through a crisp, reliable 3–5 minute demonstration of TraceRCA for hackathon judges.

---

## Prerequisites Checklist
- Docker Desktop is running.
- Terminal opened to project root (`c:\Users\HP\Desktop\TraceRCA\TraceRCA`).
- IBM Bob workspace configured with `.bob/mcp.json`.

---

## Step-by-Step Demo Script

### Step A: Start the TraceRCA Stack (30 seconds)
In PowerShell, launch all containers and wait for health confirmation:
```powershell
.\scripts\start-demo.ps1
```
*Expected Output*: All 6 containers spin up healthy.

---

### Step B: Prepare Deterministic Demo Data (20 seconds)
Run the automated preparation script:
```powershell
.\scripts\prepare-demo.ps1
```
*What this does*:
1. Degrades Provider A (returns HTTP 429).
2. Sends a demo request triggering 3 retries and fallback to Provider B.
3. Captures the generated incident (e.g. `INC-001`).
4. Executes the automated replay verification (e.g. `RPL-001`).
5. Prints summary latency improvement and dashboard URLs.

> **Note the printed Incident ID** (e.g., `INC-001`) and **Replay ID** (e.g., `RPL-001`).

---

### Step C: Open the Dashboard (30 seconds)
Navigate in browser to:
- [http://localhost:3000](http://localhost:3000)

**Presenter Talking Points**:
- "TraceRCA's dashboard aggregates real-time telemetry, active incidents, and replay verification records."
- "Notice the incident generated with `Severity: High` and the trigger indicating repeated HTTP 429s."

---

### Step D: Inspect Incident & Causal Timeline (45 seconds)
Click the incident (or open `http://localhost:3000/incidents/<incident-id>`):
- Show the **Causal Breakdown**: Trigger vs Amplifier vs Recovery.
- Show the **Timeline**: Highlight the 3 retry events with 750ms backoff delays before fallback occurred.
- Point out total latency (~3500ms).

---

### Step E: IBM Bob Incident Investigation (45 seconds)
Switch to **IBM Bob** and run the investigation skill with the incident ID:
```text
/tracerca-incident-investigation INC-001
```
*(Replace `INC-001` with the actual ID returned in Step B)*

**Presenter Talking Points**:
- "IBM Bob connects directly to TraceRCA via the Model Context Protocol (MCP)."
- "Bob queries ordered facts—never hallucinating external causes or claiming unverifiable root causes."
- "Bob isolates that Provider A 429 is the *Trigger*, but the 3 retry backoffs are the *Amplifier* that inflated latency."

---

### Step F: IBM Bob Verified Remediation (45 seconds)
In IBM Bob, execute the verified remediation skill:
```text
/tracerca-verified-remediation INC-001
```

**Presenter Talking Points**:
- "TraceRCA does not stop at suggestions. Bob derives a concrete candidate configuration targeting the amplifier (`maxRetries = 1`)."
- "Bob triggers a live replay run in TraceRCA via MCP tool `run_replay`."
- "Because the candidate completes via Provider B fallback in ~2000ms vs ~3500ms baseline, Bob assigns **VERIFIED REMEDIATION** based on empirical evidence."

---

### Step G: View Replay Verification in Dashboard (30 seconds)
Navigate to `http://localhost:3000/replays/<replay-id>`:
- Show the side-by-side comparison between **Baseline** (3 retries) and **Candidate** (1 retry).
- Point out:
  - **Latency Improvement**: ~40–45% faster response time.
  - **Retries Saved**: 2 retries saved.
  - **Status**: Verified badge displayed.

---

### Step H: Conclusion (15 seconds)
- "TraceRCA proves how AI reasoning combined with deterministic replay closes the loop from incident detection to verified fix."

---

## Fallback & Troubleshooting Procedures

### 1. Containers Restarted / Clean Slate Needed
If Docker restarts or memory state is cleared:
```powershell
.\scripts\prepare-demo.ps1
```
This will immediately recreate a new incident and replay.

### 2. Incident ID or Replay ID Changed
TraceRCA assigns IDs sequentially (`INC-001`, `INC-002`, `RPL-001`, `RPL-002`). Always check the terminal output from `prepare-demo.ps1` for the active IDs.

### 3. Bob MCP Disconnected
If IBM Bob cannot reach MCP tools:
1. Ensure `tracerca-api` is healthy:
   ```powershell
   Invoke-RestMethod http://localhost:4004/health
   ```
2. Re-check `.bob/mcp.json` points to `${workspaceFolder}/services/bob-mcp/build/index.js`.
3. Restart IBM Bob MCP connection or reload workspace.

### 4. Running a Quick Smoke Test
To verify all APIs and pages in 5 seconds:
```powershell
.\scripts\smoke-test.ps1
```

