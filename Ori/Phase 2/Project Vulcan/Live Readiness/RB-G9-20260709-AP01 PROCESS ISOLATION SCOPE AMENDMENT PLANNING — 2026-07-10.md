# RB-G9-20260709-AP01 Process Isolation Scope Amendment Planning — 2026-07-10

Status:
**PLANNING COMPLETE — PRODUCTION DISARMED UNCHANGED — NO AMENDMENT SIGNED — NO PROCESS STOPS**

Gate type:
Session-bound process-isolation scope amendment design — planning and documentation only

Prerequisites:
`RB-G9-20260709-AP01 PROCESS ISOLATION GATE — 2026-07-10 — RETRY.md` · `FINAL FRESH DOMAIN A PROOF — RB-G9-20260709-AP01 — 2026-07-10 — RECAPTURE.md` · signed G1–G4 · signed G2 process-stop requirements

Planning capture UTC:
**`2026-07-11T01:21:20Z`**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Amendment signed:** **No** · **Processes stopped/started:** **No** · **Domain A recaptured:** **No** · **C1/C2/C3:** **No** · **Runtime stub / session folder:** **Not created**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **RESTART-WRAPPER BLOCKER UNDERSTOOD**
>
> **NARROW AMENDMENT DESIGN DOCUMENTED**
>
> **NO AMENDMENT SIGNATURE · NO ISOLATION · NO DOMAIN A RECAPTURE**

---

## 2. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `RB-G9-20260709-AP01 PROCESS ISOLATION GATE — 2026-07-10.md` | First isolation attempt — FAIL CLOSED baseline expired |
| `RB-G9-20260709-AP01 PROCESS ISOLATION GATE — 2026-07-10 — RETRY.md` | Retry after recapture — FAIL CLOSED baseline expired |
| `analysis/rb_g9_20260709_ap01_process_isolation_receipt.json` | Machine-readable isolation receipt (retry) |
| `analysis/rb_g9_20260709_ap01_isolated_process_manifest.json` | Isolated-process manifest (isolation not performed) |
| `FINAL FRESH DOMAIN A PROOF — RB-G9-20260709-AP01 — 2026-07-10 — RECAPTURE.md` | Latest Domain A recapture · process inventory · wrapper note |
| `analysis/rb_g9_20260709_ap01_final_domain_a_receipt.json` | Recapture machine receipt |
| `analysis/rb_g9_20260709_ap01_arming_baseline_manifest.json` | Expired arming baseline (`3b19a92f…` — never reuse) |
| `Authorizations/AUTHORIZATION — Arming — RB-G9-20260709-AP01 — 2026-07-09.md` | Signed G2 · §5 process-stop · §P17 precondition |
| `Authorizations/AUTHORIZATION — Armed No-Submit Proof — RB-G9-20260709-AP01 — 2026-07-09.md` | Signed G4 · process-stop PASS prerequisite |
| `FRESH ARMED NO-SUBMIT PROOF ARMING AUTHORIZATION PLANNING — 2026-07-09.md` | G2 planning · process-stop requirements |
| `ARMED-STATE PROCESS ISOLATION VERIFICATION — 2026-07-07.md` | Historical isolation patterns (EV02 context) |
| `Start Momentum Bot (observation).ps1` | Documented observation launcher signatures |
| `live_validation_common.js` | `collectProcessFingerprint()` · redaction helpers |
| `analysis/rb_g9_ap01_process_isolation_gate_capture.js` | Isolation gate inventory tooling |
| `live_config.json` | Disarmed production config (read-only) |
| Runtime-stub path · session-folder path | Confirmed absent (read-only) |
| Windows scheduled tasks (read-only) | `FOMO Wallet Monitor` — unrelated project path |

---

## 3. Current process tree (planning capture)

Planning-time inventory matches retry isolation receipt. Tree reconstructed from redacted command identities and parent/child PIDs — no secrets recorded.

```
[Ancestor shell host — PID 32660]
├── [34856] PowerShell · ACTIVE RESTART WRAPPER · monitor.js (while $true · 60s sleep)
│   └── [6568] node.exe · monitor.js
├── [20188] PowerShell · PASSIVE LAUNCHER · dashboard_server.js (no while loop)
├── [37868] PowerShell · OBSERVATION-ONLY LOOP · b2a_24h_observation_status (+ status checks)
│
[Separate launcher host — PID 45148]
└── [40392] node.exe · dashboard_server.js

[Separate launcher host — PID 45808]
└── [9896] node.exe · scanner_gmgn_trending.js --watch
```

| Identity | PID | Parent PID | Role |
|----------|-----|------------|------|
| **monitor.js** (node) | **6568** | **34856** | Authorized target |
| **monitor restart wrapper** | **34856** | **32660** | Active restart loop — **blocker** |
| **dashboard_server.js** (node) | **40392** | **45148** | Authorized target |
| **dashboard passive shell** | **20188** | **32660** | Non-loop launcher shell |
| **scanner_gmgn_trending.js** (node) | **9896** | **45808** | Authorized target |
| **live_executor.js** (node) | — | — | **Count 0** |
| **b2a observation loop** | **37868** | **32660** | Ancillary observation — not isolation target |

**Scheduled task note:** `FOMO Wallet Monitor` executes `C:\TracktaOS\Projects\Active\FOMO-Wallet-Intel\run-monitor.bat` — **different project**. Must **not** be stopped or conflated with `monitor.js` for this session.

**Parent PID 32660:** Common ancestor for observation-mode PowerShell windows launched from `Start Momentum Bot (observation).ps1` (or equivalent multi-window start). Not itself an authorized stop target — stopping by parent PID alone is **prohibited**.

---

## 4. Wrapper and shell classifications

| PID | Classification | Rationale |
|-----|----------------|-----------|
| **34856** | **active restart wrapper** | `while ($true) { … node monitor.js; Start-Sleep -Seconds 60 }` — sole purpose is relaunching monitor on exit |
| **20188** | **passive launcher shell** | `-NoExit` PowerShell running `node dashboard_server.js` once — **no** `while ($true)` relaunch loop |
| **37868** | **observation-only loop** | Runs `b2a_24h_observation_status.js` and read-only status checks — does not relaunch monitor/dashboard/scanner |
| **32660** | **unrelated shell host** (for stop purposes) | Terminal/launcher host for multiple observation windows — **not** a safe stop target by PID alone |
| **45148** | **passive launcher host** | Parent of dashboard node only — no restart loop evidenced |
| **45808** | **passive launcher host** | Parent of scanner node only — no restart loop evidenced |

---

## 5. Proof requirements before wrapper enters amended scope

A PowerShell parent may be added to the amended stop list **only if all** are proven at isolation gate time:

| # | Requirement |
|---|-------------|
| **R1** | Command identity fully known and matches an approved normalized signature (§8) |
| **R2** | Sole operational purpose is relaunching **one** already-authorized target (monitor, dashboard, or scanner) |
| **R3** | Stopping it cannot invoke submit/sign/broadcast or mutate trading state |
| **R4** | It is not the operator's active terminal, Cursor process, editor shell, or unrelated automation |
| **R5** | Parent/child relationship proven (wrapper PID → authorized node PID, or documented orphan wrapper with matching signature) |
| **R6** | Command line recorded redacted — no secret-bearing arguments |
| **R7** | Termination reversible through ordinary documented startup (`Start Momentum Bot (observation).ps1` or equivalent) |
| **R8** | No other application depends on the wrapper (cross-project tasks excluded) |

If any requirement fails → **FAIL CLOSED** — do not broaden scope ad hoc.

---

## 6. PID 34856 — qualification assessment

| Field | Value |
|-------|-------|
| **Classification** | **active restart wrapper** |
| **Qualifies for amended scope** | **Yes** |
| **Rationale** | Signature matches `Start Momentum Bot (observation).ps1` monitor loop exactly; child PID 6568 proven; relaunch interval 60s; stopping monitor alone will respawn within one sleep cycle; stopping wrapper satisfies G2 §5 "automatic restart forbidden" intent |

**Approved normalized signature (monitor restart wrapper):**

```
powershell.exe -NoExit -Command cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; while ($true) { Get-Date; node monitor.js; Start-Sleep -Seconds 60 }
```

Matching rule: executable `powershell.exe`, project `cd` to repo root, `while ($true)` loop containing `node monitor.js` and `Start-Sleep` with 60-second interval. Whitespace/casing normalization permitted; path must match repo root.

---

## 7. PID 20188 — qualification assessment

| Field | Value |
|-------|-------|
| **Classification** | **passive launcher shell** |
| **Qualifies for amended scope** | **No** *(not required)* |
| **Rationale** | Command is `node dashboard_server.js` without `while ($true)` — shell stays open but does **not** auto-relaunch on child exit. Dashboard node **40392** parent is **45148**, not 20188 — indicating independent launch path. Stopping node **40392** is sufficient; 20188 may remain as idle shell or be ignored if absent after node stop |

**Inclusion trigger (future only):** Add dashboard restart wrapper to amended scope **only if** a future inventory proves a `while ($true)` loop wrapping `dashboard_server.js` with the same parent/child respawn behavior as monitor.

**Approved normalized signature (dashboard passive launcher — record-only, not stop-required today):**

```
powershell.exe -NoExit -Command cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; node dashboard_server.js
```

---

## 8. Scanner wrapper result

| Field | Value |
|-------|-------|
| **Active scanner restart wrapper present** | **No** |
| **Scanner node** | PID **9896** · `scanner_gmgn_trending.js --watch` · parent **45808** |
| **Amended scope inclusion required** | **No** |

The running scanner uses internal `--watch` loop inside the Node process — not an external PowerShell restart wrapper. Stopping node **9896** is sufficient.

**Note:** `Start Momentum Bot (observation).ps1` launches a **different** loop (`node scanner.js` every 60s) — that loop is **not** currently running. If it appears in future inventory with `while ($true)` and `scanner_gmgn_trending.js`, treat as new evidence requiring signature review — **not** pre-authorized.

---

## 9. PID 37868 — classification and fingerprint impact

| Field | Value |
|-------|-------|
| **Classification** | **observation-only loop** |
| **Termination authorized** | **No** — no demonstrated need |
| **Affects process fingerprint stability** | **Yes** — included when isolation tooling scans `b2a_24h` pattern |
| **Isolation gate impact** | **Non-blocking** — may remain running during isolation if it does not relaunch stopped targets |
| **Baseline capture recommendation** | Future Domain A baseline must **inventory and bind** ancillary observation processes explicitly so benign presence does not cause false mismatch abort |

**Behavior:** Periodic read-only observation/status checks — not a submit path, not an executor loop (`live_executor.js --loop` count remains **0**).

**Proof tooling note:** Isolation inventory classifier may label this entry `live_executor.js` when the loop includes `live_executor.js --status` — tooling should treat `--status` as read-only ancillary, not executor loop, in future gate implementation. **No production code change in this planning gate.**

---

## 10. Exact command-identity rules

Amended stop scope uses **verified command identity**, not volatile PID.

### 10.1 Authorized Node targets (always)

| Identity | Match rule |
|----------|------------|
| **monitor.js** | `node.exe` command line contains `monitor.js` · not `--loop` · not `live_executor` |
| **dashboard_server.js** | `node.exe` command line contains `dashboard_server.js` |
| **scanner_gmgn_trending.js** | `node.exe` command line contains `scanner_gmgn_trending.js` |

### 10.2 Authorized restart wrappers (amendment-required)

| Identity | Match rule | Required today |
|----------|------------|----------------|
| **monitor restart wrapper** | §6 normalized signature | **Yes** |

### 10.3 Explicitly out of scope (must not stop)

| Identity | Reason |
|----------|--------|
| **b2a observation loop** | Observation-only · §9 |
| **live_executor.js** (any) | Must be count **0** — if present, abort isolation |
| **FOMO Wallet Monitor scheduled task** | Unrelated project |
| **Cursor / editor / operator terminal hosts** | Not application targets |
| **Parent PID 32660 alone** | Host shell — not identity-verified |

---

## 11. Proposed amended stop scope

After signed amendment, future **Process Isolation Gate** may stop **only**:

1. **monitor restart wrapper** matching §6 normalized signature (before or with monitor node)
2. **monitor.js** node process(es)
3. **dashboard_server.js** node process(es)
4. **scanner_gmgn_trending.js** node process(es)

**Conditionally authorized (evidence-triggered only):**

5. **dashboard restart wrapper** — only if future inventory proves `while ($true)` + `dashboard_server.js` relaunch loop matching §7 trigger

**Not authorized without separate future amendment:**

- PID 37868 observation loop
- PID 20188 passive dashboard shell (unless later proven active restart)
- Any PowerShell/Node process not matching exact approved signatures
- Scheduled tasks · services · watchdogs · terminal hosts

---

## 12. Explicitly prohibited termination scope

| Prohibition | Detail |
|-------------|--------|
| **All PowerShell processes** | Forbidden |
| **All node.exe processes** | Forbidden |
| **Stop by parent PID alone** | Forbidden (e.g., killing 32660) |
| **Terminal / Cursor / editor shells** | Forbidden |
| **Wildcard process-tree kill** | Forbidden |
| **Unrelated scheduled tasks or services** | Forbidden — includes `FOMO Wallet Monitor` |
| **b2a observation loop (37868)** | Forbidden in this amendment |
| **Broadening during failed isolation** | Forbidden — FAIL CLOSED instead |

---

## 13. Future isolation stop order

Execute only after fresh Domain A baseline and signed scope amendment:

| Step | Action |
|------|--------|
| **1** | Verify baseline fresh (< 30 min) · G1 unexpired · G1–G4 unused |
| **2** | Capture pre-isolation inventory · recompute process-set fingerprint |
| **3** | Verify wrapper signatures against amendment (34856 must match §6) |
| **4** | **Stop authorized restart wrappers first** (monitor wrapper 34856) |
| **5** | Confirm wrapper absent · bounded wait |
| **6** | Gracefully stop authorized Node targets (monitor · dashboard · scanner) |
| **7** | Bounded wait · verify exit · force **only named authorized targets** if graceful fails |
| **8** | Confirm executor count **0** · no child replacement |
| **9** | **Observe ≥ 10 seconds** · rescan · require no respawn |
| **10** | Capture post-isolation inventory · derive `isolatedProcessSetHash` |
| **11** | Verify baseline preservation · recheck freshness for Arming Transition Gate |

---

## 14. Respawn observation requirements

| Requirement | Detail |
|-------------|--------|
| **Minimum observation** | **10 seconds** after last authorized stop |
| **Rescan scope** | monitor.js · dashboard_server.js · scanner_gmgn_trending.js · monitor restart wrapper signature |
| **Pass condition** | All authorized targets count **0** · no matching restart wrapper reappears |
| **Fail condition** | Any authorized target respawns · unexplained new wrapper · executor appears |
| **Ancillary processes** | PID 37868 may remain — does not fail isolation if authorized targets stay stopped |

---

## 15. Restoration / rollback policy

| Rule | Detail |
|------|--------|
| **During isolation or armed proof window** | **No silent restart** of monitor · dashboard · scanner · or wrappers |
| **Ordinary restart** | **Not part of armed proof window** — deferred until Domain C closure |
| **Post-session restoration** | Distinct closure action — use documented startup (`Start Momentum Bot (observation).ps1` or operator runbook) **after** G1–G4 consumed and disarm verified |
| **Isolation gate failure** | Leave processes as found — no corrective restarts during gate |
| **Proof completion** | Domain C PASS first · then optional operational restoration as separate operator decision |

---

## 16. Amendment governance relationship

| Question | Determination |
|----------|---------------|
| **Mechanism** | **Option A — additive process-isolation authorization amendment linked to G2** |
| **G2 modification required** | **No** — signed G2 remains authoritative; amendment supplements §5 process-stop interpretation |
| **G4 modification required** | **No** — G4 requires isolation PASS; amendment defines how PASS is achieved |
| **Signed G2 in-place edit** | **Forbidden** |
| **G4 execution scope broadening** | **Forbidden** |

**Proposed amendment canonical path (future gate — not created here):**

```
Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Process Isolation Scope Amendment — RB-G9-20260709-AP01 — 2026-07-10.md
```

Amendment must bind: session ID · G2 fingerprint · exact wrapper signatures · explicit non-authorizations · link to isolation gate receipt schema.

---

## 17. Authorization timing assessment

| Field | Value |
|-------|-------|
| **Planning capture UTC** | `2026-07-11T01:21:20Z` |
| **G1 expiry UTC** | `2026-07-11T03:25:11Z` |
| **Remaining G1 lifetime** | **~2 hours 4 minutes** (~7,431,000 ms) |

### Estimated minimum chain duration (after amendment signed)

| Gate | Estimate |
|------|----------|
| Process Isolation Scope Amendment Authorization | 15–45 min (human) |
| Final Fresh Domain A Proof | 15–25 min |
| Process Isolation Gate | 10–20 min *(must finish within 30 min of Domain A)* |
| Arming Transition Gate | 10–15 min |
| Runtime Stub Creation Gate | 10–15 min |
| Armed No-Submit Proof + immediate disarm | 15–25 min |
| Domain C closure | 15–25 min |
| **Optimistic total** | **~90–170 min** |
| **Comfort buffer recommended** | **≥ 30 min slack** |

### Safe-time sufficiency assessment

**NOT COMFORTABLY SUFFICIENT** for the full chain through Domain C closure in the remaining G1 window.

The chain is **theoretically possible** only if amendment authorization is signed **immediately** and all gates execute back-to-back with no drift or human delay — but that violates the "do not rush" principle from G2/G4 planning.

### Chain continuation recommendation

| Path | Recommendation |
|------|----------------|
| **Salvage current G1–G4** | **Risky** — proceed only if Taylor signs amendment authorization within ~30 minutes and commits to same-session execution through isolation |
| **Clean reauthorization** | **Preferred** if amendment authorization cannot be signed promptly — allow G1–G4 to expire rather than rush isolation/arming/proof |

---

## 18. Future gate sequence (ordered)

1. **RB-G9-20260709-AP01 Process Isolation Scope Amendment Authorization**
2. **Final Fresh Domain A Proof for RB-G9-20260709-AP01**
3. **RB-G9-20260709-AP01 Process Isolation Gate**
4. **RB-G9-20260709-AP01 Arming Transition Gate**
5. **RB-G9-20260709-AP01 Runtime Stub Creation Gate**
6. **Armed No-Submit Proof Execution Gate**
7. **Immediate Domain C closure**

**Critical ordering invariant:** Amendment authorization **before** Domain A recapture — recapturing Domain A without resolved wrapper scope would likely waste another 30-minute freshness window.

---

## 19. Post-gate verification

| Check | Result |
|-------|--------|
| **Code / tests / config / .env changed** | **No** |
| **Processes stopped or started** | **No** |
| **G1–G4 consumed** | **No** |
| **Runtime stub / session folder created** | **No** |
| **System remains disarmed** | **Yes** |
| **Submit / sign / broadcast** | **None** |
| **Flat capital state** | **Yes** |

---

## 20. Planning gate status

**PASS — PLANNING COMPLETE**

Readiness/profitability claims: **none**

---

## 21. Recommended next gate

**RB-G9-20260709-AP01 Process Isolation Scope Amendment Authorization**

*(If amendment authorization cannot be signed promptly, prefer **RB-G9 Armed No-Submit Proof Reauthorization Planning** rather than rushing the remaining G1 window.)*

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9-20260709-AP01 PROCESS ISOLATION SCOPE AMENDMENT PLANNING — 2026-07-10.md`
