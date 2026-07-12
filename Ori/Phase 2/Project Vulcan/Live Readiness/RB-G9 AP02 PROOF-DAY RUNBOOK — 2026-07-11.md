# RB-G9 AP02 Proof-Day Runbook — 2026-07-11

Status:
**DOCUMENTATION ONLY — NOT EXECUTED — PRODUCTION DISARMED**

Session ID:
**`RB-G9-20260713-AP02`**

Proof date / window:
**2026-07-13 · 14:00–20:00 MDT** · UTC **`2026-07-13T20:00:00Z`** – **`2026-07-14T02:00:00Z`**

Companion gate receipt:
[`RB-G9 AP02 PRE-G1 OPERATIONAL READINESS — 2026-07-11.md`](RB-G9%20AP02%20PRE-G1%20OPERATIONAL%20READINESS%20%E2%80%94%202026-07-11.md)

**Do not execute commands in this runbook until the corresponding authorized gate is open.**

No secret values · no RPC credentials · no private keys · placeholders remain until runtime generation.

---

## 1. Proof-day timeline (recommended)

| Phase | Local time (MDT) | Gate / action |
|-------|------------------|---------------|
| Operating-block start | **14:00** | Taylor on HX370 · access re-check |
| Access + prerequisite confirmation | **14:00–14:30** | Reconfirm host · power · remote · signer/RPC booleans |
| G1–G4 + isolation amendment governance block | **Immediately after 14:30** | Sign authorizations only — no C1–C3 yet |
| Final Fresh Domain A | **Immediately after G1–G4 validation** | Fresh baseline capture |
| Process Isolation | **Immediately after Domain A PASS** | Exact-identity stops only |
| Arming Transition (C1–C3) | **Only after isolation PASS + freshness thresholds** | Separate authorized gate |
| Runtime Stub Creation | **Only after LIVE_ARMED confirmed** | G3 gate |
| Armed validator + AP manifest + armed-safe N6 | **Within 15-minute armed window** | G4 gate |
| Immediate disarm + stub removal + Domain C | **On PASS · FAIL · abort · ambiguity · timeout** | Mandatory |
| Restoration (optional) | **Only after Domain C closure** | Separate operator action |

**G1 sign latest (if Domain A at 14:30 MDT):** no later than **10:00 MDT** same day *(≥ 4 h G1 lifetime before Domain A)*.

---

## 2. No-rush thresholds (fail closed — no override)

| Threshold | Minimum remaining | Fail-closed action |
|-----------|-------------------|-------------------|
| G1 lifetime before Final Fresh Domain A starts | **≥ 4 hours** | Do not begin Domain A · reschedule |
| Domain A freshness before Process Isolation starts | **≥ 20 minutes** | Do not begin isolation · recapture or abort |
| Domain A freshness before C1 | **≥ 12 minutes** | Do not begin C1 · recapture or abort |
| LIVE_ARMED window remaining before AP invocation | **≥ 10 minutes** | Do not invoke AP · disarm |

---

## 3. Pre–Domain A operator cleanup (not governed isolation)

Before Final Fresh Domain A baseline capture, close unnecessary diagnostic shells:

| Identity | Ordinary close procedure |
|----------|---------------------------|
| **b2a observation loop** | Close the PowerShell window running `b2a_24h_observation_status.js` + `live_executor.js --status`, or stop that exact PowerShell process after command-identity verification |
| **scanner.js restart loop** *(observation launcher artifact)* | Close the PowerShell window running `while ($true) { node scanner.js … }`, or stop that exact PowerShell process after identity verification |

These are **operator cleanup** actions — not substitutes for governed Process Isolation. Do **not** stop FOMO Wallet Monitor.

---

## 4. Proof command plan (ordered — do not run early)

### 4.1 Governance block (near operating window)

1. Validate AP02 G1–G4 chain unused · unexpired · session-bound · disarmed
2. Sign **AP02 G1** R15 authorization
3. Sign **AP02 G2** Arming Authorization
4. Sign **AP02 G3** Runtime Stub Creation Authorization
5. Sign **AP02 G4** Armed No-Submit Proof Authorization
6. Sign **AP02 Process Isolation Scope Amendment** *(or incorporate into G2 per planning)*

### 4.2 Final Fresh Domain A

```bash
cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot

node validate_live_system.js
node run_safety_tests.js
node test_n6_estop_drill.js

node validate_armed_preflight.js --json
node run_armed_preflight_manifest.js
node test_n6_armed_estop_probe.js
```

**Expected while disarmed:** armed tools exit **2** (wrong posture) — fail-closed correct.

Capture Domain A receipt and **`armingBaselineHash`** *(runtime placeholder `{ARMING_BASELINE_HASH}`)* per authorized Domain A gate procedure.

### 4.3 Process Isolation *(authorized gate only)*

Preconditions:
- Fresh Domain A PASS
- Domain A freshness **≥ 20 minutes** remaining
- Exact command identities match pre-G1 verified rules
- FOMO Wallet Monitor confirmed excluded

Order:
1. Validate fresh Domain A baseline binding
2. Verify exact process identities (command-line rules — not PID-only)
3. Verify FOMO Wallet Monitor exclusion
4. Stop **exact authorized restart wrappers first** (monitor wrapper only today)
5. Verify wrappers absent
6. Gracefully stop authorized Node targets: `monitor.js` · `dashboard_server.js` · `scanner_gmgn_trending.js`
7. Bounded wait
8. Force only exact authorized targets if graceful stop fails
9. Observe **≥ 10 seconds**
10. Prove no respawn
11. Derive **`isolatedProcessSetHash`** *(runtime placeholder `{ISOLATED_PROCESS_SET_HASH}`)*
12. Remain disarmed until separate C1–C3 gate

### 4.4 Arming Transition (C1–C3) *(separate authorized gate only)*

Preconditions:
- Isolation PASS
- Domain A freshness **≥ 12 minutes** remaining before C1
- G2 signed and valid

| Step | Target | Change |
|------|--------|--------|
| **C1** | `.env` | `FOMO_ENABLE_LIVE_SUBMISSION=YES` |
| **C2** | `live_config.json` | `"executionMode": "LIVE"` |
| **C3** | `live_config.json` | `"dryRunMode": false` |

Sanitized verification probe *(no secrets printed)*:

```bash
node -e "const fs=require('fs');const le=require('./live_executor');require('./local_env').loadLocalEnv();const cfg=le.loadConfig();const armed=le.computeLiveArmedStatus(cfg);console.log(JSON.stringify({executionMode:cfg.executionMode,dryRunMode:cfg.dryRunMode,liveArmed:armed.liveArmed,failures:armed.failures,operationalPosture:armed.operationalPosture,fomoEnableLiveSubmission:process.env.FOMO_ENABLE_LIVE_SUBMISSION?'set':'unset'},null,2));"
```

### 4.5 Runtime Stub Creation *(G3 gate only — after LIVE_ARMED confirmed)*

Create secret-free stub at authorized path only after G3 gate opens. Mirror G1 fields exactly. No candidate · quote · trade · capital fields.

### 4.6 Armed validator + AP manifest + armed-safe N6

Precondition: LIVE_ARMED window **≥ 10 minutes** remaining before AP invocation.

```bash
node validate_armed_preflight.js --json \
  --session-id RB-G9-20260713-AP02 \
  --arming-baseline-hash {ARMING_BASELINE_HASH} \
  --auth-g1 {AP02_G1_PATH} \
  --auth-g2 {AP02_G2_PATH} \
  --auth-g3 {AP02_G3_PATH} \
  --auth-g4 {AP02_G4_PATH}

node run_armed_preflight_manifest.js --out analysis/rb_g9_20260713_ap02_armed_preflight_manifest_receipt.json

node test_n6_armed_estop_probe.js
```

### 4.7 Domain C validation + safety suite + closure filing

After disarm + stub removal:

```bash
node validate_live_system.js
node run_safety_tests.js
node test_n6_estop_drill.js
```

File session evidence under `Sessions/SESSION — RB-G9-20260713-AP02/` only after authorized Domain C closure gate.

---

## 5. Rollback plan (D1–D11) — documentation only

Execute only on abort · timeout · ambiguity · armed timer expiry · or normal PASS closure.

| Step | Action |
|------|--------|
| **D1** | Unset/remove `FOMO_ENABLE_LIVE_SUBMISSION` in `.env` |
| **D2** | `live_config.json`: `"executionMode": "PIPELINE_DRY_RUN"` |
| **D3** | `live_config.json`: `"dryRunMode": true` |
| **D4** | Verify `liveArmed: false` · posture **`PIPELINE_OBSERVING`** |
| **D5** | Stop all executor processes *(must remain count 0)* |
| **D6** | Remove/consume runtime stub if created |
| **D7** | Verify no temporary stub · flat/no position/reconciliation/recovery/capital |
| **D8** | Domain C: `node validate_live_system.js` **PASS** |
| **D9** | Domain C: `node run_safety_tests.js` **85/85 PASS** |
| **D10** | File RB-G9 session evidence under `Sessions/SESSION — RB-G9-20260713-AP02/` |
| **D11** | Close AP02 G1–G4 + amendment — **CONSUMED/CLOSED — do not reuse** |

### Emergency abort vs normal PASS closure

| Outcome | D1–D11 | Retry same session |
|---------|--------|-------------------|
| **Normal PASS closure** | Full D1–D11 · classify `ARMED_NO_SUBMIT_PROOF_PASS` | **No** |
| **Emergency abort / timeout / ambiguity during armed window** | Full D1–D11 · classify abort | **No retry in same session** |
| **Fail closed before arming** | No stub · no capital · disarm unchanged | Reschedule with new chain |

**No retry after an armed-window abort.**

---

## 6. Restoration procedure (after Domain C closure only)

Restoration is **not** part of isolation · arming · stub · or proof. Run only after Domain C PASS and session closure filing.

| Component | Normal startup |
|-----------|----------------|
| **Monitor + restart wrapper** | `Start Momentum Bot (observation).ps1` monitor line, or manual: `powershell -NoExit -Command "cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; while ($true) { Get-Date; node monitor.js; Start-Sleep -Seconds 60 }"` |
| **Dashboard** | `Start Momentum Bot (observation).ps1` dashboard line, or manual: `powershell -NoExit -Command "cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; node dashboard_server.js"` |
| **Scanner (gmgn watch)** | Start `node scanner_gmgn_trending.js --watch` from repo root in dedicated shell *(preferred production scanner)* |
| **FOMO Wallet Monitor** | **No restoration required** — never stopped · scheduled task `FOMO-Wallet-Intel\run-monitor.bat` |

Record restoration as a **distinct closure action** in session evidence.

---

## 7. Power / connectivity abort rule

If power or connectivity becomes unstable during the operating block:

1. **Do not** begin or continue C1–C3 · stub creation · or AP invocation
2. If already LIVE_ARMED: execute **D1–D11 immediately**
3. Classify abort · file evidence · **no retry in same session**
4. Reschedule via **RB-G9 AP02 Operating Window Reselection**

---

**Runbook path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 AP02 PROOF-DAY RUNBOOK — 2026-07-11.md`
