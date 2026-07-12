# A1-D03 Crash Drill Authorization — 2026-07-06

Status:
**Authorization complete — Taylor authorizes a bounded future A1-D03 Tier 1 fixture crash drill execution gate; no drill, code, config, runtime, or readiness action in this gate**

Gate type:
Human authorization record — scope and boundaries for the next drill execution gate

Prerequisites (all complete):
`A1-D03 CRASH DRILL PLANNING — 2026-07-06.md` · `PRE-ARMING BLOCKER STATUS REVIEW — POST-A1-D04 — 2026-07-06.md` · `A1-D04 RECONCILIATION DRILL EXECUTION — 2026-07-06.md` · `A1 STATE DURABILITY DRILL PLANNING — 2026-07-05.md` · `A1 CRITICAL DRILL BATCH EXECUTION — 2026-07-05.md` · `R16 IMPLEMENTATION VERIFICATION REVIEW — 2026-07-06.md`

Decision authority:
**Taylor Cheaney**

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Config changed:** **No** · **Runtime processes started:** **No** · **Drill executed:** **No** · **Real RPC used:** **No** · **Real signer secrets used:** **No** · **R13 sign-off performed:** **No** · **Arming authorized:** **No** · **Micro-live execution authorized:** **No**

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `A1-D03 CRASH DRILL PLANNING — 2026-07-06.md` | Tier 1–3 split; W1–W6 windows; evidence/abort matrices |
| `PRE-ARMING BLOCKER STATUS REVIEW — POST-A1-D04 — 2026-07-06.md` | A1-D03 highest technical tear-risk; N4 partial status |
| `A1-D04 RECONCILIATION DRILL EXECUTION — 2026-07-06.md` | Fixture drill pattern; reconciliation semantics to preserve |
| `A1 STATE DURABILITY DRILL PLANNING — 2026-07-05.md` | Original A1-D03 Tier B arming requirement |
| `A1 CRITICAL DRILL BATCH EXECUTION — 2026-07-05.md` | Temp-root harness baseline; D01/D02/D07 — not mid-write crash |
| `R16 IMPLEMENTATION VERIFICATION REVIEW — 2026-07-06.md` | Confirm-before-write; position-write coupling |
| `ACTIVE_MANIFEST.md` | Atomic store ownership; lock TTL; authoritative file list |

**Code references (read-only, not modified):** `config_store.js` · `live_positions_store.js` · `observation_dedup_store.js` · `executor_singleton_guard.js` · `test_a1_d04_reconciliation_drill.js` (fixture model) · `scripts/a1_critical_drill_batch.js` (temp-root pattern — **not** authorized for SIGKILL in Tier 1)

---

## 2. Authorization Decision (Taylor — Recorded)

Taylor **authorizes a future A1-D03 Tier 1 Fixture Crash Drill Execution gate** under **fixture/temp-root simulated crash-class interruption only**.

**This authorization gate does not execute the drill.** It grants scope for the **Tier 1 execution gate only**.

**Framing:** A1-D01/D02 batch drills prove graceful stop and stale-lock hygiene in temp harnesses. A1-D04 proves reconciliation on **ambiguous outcomes** — not store tear under crash-class interruption. Unit atomic tests (`test_config_store_atomic.js`, `test_live_positions_atomic.js`, etc.) prove write primitives — not end-to-end mid-window interruption. A1-D03 Tier 1 closes the **highest open technical tear-risk gap** in N4: simulated crash during critical state windows must not leave torn authoritative state, duplicate executor ownership, silent position corruption, or persistent `*.tmp` files — **without** LIVE mode, arming, capital, real RPC, real signer secrets, process kill on production root, or production `--loop` interruption.

**Relationship to prior drills:**

| Prior evidence | What A1-D03 Tier 1 adds |
|----------------|-------------------------|
| A1-D01/D02 batch (temp) | Mid-write **simulated** crash — not graceful stop alone |
| A1-D04 fixture PASS | Store durability under interruption — must not regress reconciliation semantics |
| R16 mocked coupling | Confirm-before-write — W3/W4 windows specifically |
| `test_*_atomic.js` | End-to-end fixture hooks at W4/W6 — not unit-only |

**Blocker target:** **N4 / A1-D03 / LR-05** move toward **partial fixture closure** on successful Tier 1 execution; **does not** close N8 R13 governance, N5 real-path proof, Tier 2/3 crash drills, A1-D05, or arming readiness.

**Execution priority (Tier 1):** **W4 → W6 → W3 → W5 → W2 → W1**

---

## 3. Authorized Future Drill Scope (Next Gate: A1-D03 Tier 1 Fixture Crash Drill Execution)

The authorized execution gate may run **Tier 1 fixture-only** drills (temp `TRACKTA_RUNTIME_ROOT`, mocked RPC/signer, synthetic crash hooks — **no production process kill**) to verify:

| # | Requirement | Expected behavior |
|---|-------------|-------------------|
| **1** | Fixture/temp `TRACKTA_RUNTIME_ROOT` only | All authoritative writes under temp root; production config hash unchanged |
| **2** | Mocked RPC/signer only | Synthetic keypairs; mocked fetch hooks; no real broadcast |
| **3** | Simulated crash-class interruption hooks | Injected failure mid-window — **not** SIGKILL; **not** production `--loop` kill |
| **4** | W1 — after quote/pass, before submit | Stores parse; no position write; no persistent `*.tmp` |
| **5** | W2 — after submit fixture, before confirmation classification | No OPEN position; reconciliation row if ambiguity path applies; A1-D04 semantics preserved |
| **6** | W3 — after confirmed fixture, before position write | **No position write** or prior valid state preserved |
| **7** | W4 — during `live_positions.json` atomic write | Pre-crash valid file **or** complete post-crash valid file; **no** persistent `*.tmp`; no torn JSON |
| **8** | W5 — during `pending_reconciliation.jsonl` append | Append-only; valid JSONL lines; no corrupt trailing bytes |
| **9** | W6 — during lock ownership / heartbeat update | Lock parse-valid or safely absent/stale; no duplicate ownership after recovery simulation |
| **10** | Post-drill cleanup | Temp root removed; posture `PIPELINE_DRY_RUN` · `dryRunMode: true` · `liveArmed: false` · `capitalExposure: none` |

### 3.1 Allowed methods in next gate

| Category | Allowed |
|----------|---------|
| New fixture drill test file | e.g. `test_a1_d03_crash_drill.js` — W1–W6 matrix under temp `TRACKTA_RUNTIME_ROOT` |
| Mocked RPC / signer / crash hooks | Same fixture class as `test_a1_d04_reconciliation_drill.js` |
| Test hooks on atomic write paths | Mid-write simulated interruption for W4/W6 — temp root only |
| Machine evidence artifact | `analysis/a1_d03_crash_drill_evidence.json` |
| Execution receipt | `A1-D03 TIER 1 FIXTURE CRASH DRILL EXECUTION — YYYY-MM-DD.md` |
| `run_safety_tests.js` manifest entry | If new test file added — suite must remain green |
| Read-only production config snapshot | Preflight/postflight posture comparison (no production mutation) |
| JSON parse sweep + tmp-file sweep | Per planning doc §6 |

### 3.2 Recommended scenario matrix (execution gate)

| ID | Window | Priority | Maps to scope |
|----|--------|----------|---------------|
| **D3-0** | Preflight + postflight posture | Required | #1, #10 |
| **W4** | During `live_positions.json` atomic write | **1** | #7 |
| **W6** | During lock / heartbeat update | **2** | #9 |
| **W3** | After confirm, before position write | **3** | #6 |
| **W5** | During reconciliation append | **4** | #8 |
| **W2** | After submit, before confirmation | **5** | #5 |
| **W1** | After quote/pass, before submit | **6** | #4 |

**Existing baseline (retain — do not replace):** `test_config_store_atomic.js` · `test_live_positions_atomic.js` · `test_observation_dedup_atomic.js` · `test_executor_singleton_guard.js` · A1-D04 reconciliation fixture evidence.

**Explicitly out of scope for this authorization:** Tier 2 SIGKILL · Tier 3 production-root interruption · production `--loop` kill · real process crash on production root.

---

## 4. Explicit Non-Authorizations

The following remain **not authorized** in this gate and in the **next Tier 1 execution gate** unless separately gated:

| Item | Status |
|------|--------|
| **Tier 2 SIGKILL** / isolated process `Stop-Process -Force` on executor child | **Not authorized** — separate future authorization after Tier 1 PASS |
| **Tier 3 production-root dry-run interruption** | **Not authorized** — separate future authorization |
| **Production `--loop` / scanner interruption** | **Not authorized** |
| **LIVE mode** (`executionMode` LIVE on production config) | **Not authorized** |
| **`dryRunMode: false`** on production config | **Not authorized** |
| **`liveArmed: true`** | **Not authorized** |
| **`FOMO_ALLOW_LOOP_LIVE=YES`** | **Not authorized** |
| **Capital exposure** / live trading / micro-live execution | **Not authorized** |
| **Real signer secrets** | **Not authorized** |
| **Real RPC broadcast** | **Not authorized** |
| **`.env` edits** | **Not authorized** |
| **Secret inspection** | **Not authorized** |
| **`process.env` dump** | **Not authorized** |
| **R13 sign-off** | **Not authorized** |
| **OR promotion** (`OR-20260630-008` or any OR) | **Not authorized** |
| **Production capital-path drill** | **Not authorized** |
| **Live readiness claim** | **Not authorized** |
| **Human soak readiness claim** | **Not authorized** |
| **Arming gate** | **Not authorized** |
| **A1-D03 drill execution in this authorization gate** | **Not authorized** — deferred to next gate |

---

## 5. Expected Future Evidence (Tier 1 Execution Gate Deliverables)

The **A1-D03 Tier 1 Fixture Crash Drill Execution** gate must produce:

| # | Evidence artifact | Content |
|---|-------------------|---------|
| **1** | Preflight posture snapshot | `executionMode`, `dryRunMode`, `liveArmed`, `capitalExposure`, production config hash |
| **2** | Before/after state hashes | SHA-256 for `live_config.json`, `live_positions.json`, `observation_dedup.json`, lock file (production hash unchanged) |
| **3** | W1–W6 per-window results | PASS/FAIL; window ID; hook description; timestamps |
| **4** | Lock/heartbeat evidence | Lock JSON before/after; stale classification; duplicate ownership check |
| **5** | JSON parse sweep | All authoritative JSON + JSONL line-by-line parse — zero errors |
| **6** | Tmp-file sweep | List `*.tmp` under temp root — **must be empty** after recovery |
| **7** | Reconciliation/audit artifact | Line counts; valid rows; secret-free confirmation; A1-D04 regression spot-check |
| **8** | Duplicate ownership check | No dual active loop simulation; lock semantics honest |
| **9** | Post-recovery posture snapshot | Harness DRY/unarmed/no-capital; production config hash unchanged |
| **10** | Test command results | Per-window PASS/FAIL; exit codes |
| **11** | `run_safety_tests.js` result | **If practical** — full suite green after any manifest addition |

**Machine artifact (required):** `analysis/a1_d03_crash_drill_evidence.json` with `allPass`, window matrix, temp root path, timestamps.

---

## 6. Future Abort Criteria (Tier 1 Execution Gate — Immediate Stop)

The execution gate **must abort immediately** if any of the following is detected:

| # | Abort condition |
|---|-----------------|
| **1** | `executionMode` LIVE detected on production config |
| **2** | `dryRunMode: false` detected on production config |
| **3** | `liveArmed: true` detected |
| **4** | `FOMO_ALLOW_LOOP_LIVE=YES` detected |
| **5** | `capitalExposure` not `none` |
| **6** | Real signer secret access attempted or required |
| **7** | Real RPC broadcast attempted |
| **8** | Production `--loop` / scanner touched without Tier 3 authorization |
| **9** | Torn/corrupt authoritative state (unparseable JSON, truncated array) |
| **10** | Duplicate executor ownership (dual active loop) |
| **11** | Missing reconciliation artifact when ambiguity path expected (W2/W5) |
| **12** | Persistent `*.tmp` files after recovery window |
| **13** | Secret exposure in logs, audit rows, or evidence artifacts |
| **14** | Unexplained posture drift on production config after drill |
| **15** | Silent position corruption — partial OPEN row or torn `live_positions.json` (W3/W4) |
| **16** | A1-D04 regression — auto-resolution invoked; position written on ambiguous pre-confirm crash (W2) |

On abort: document failure receipt, preserve evidence, restore safe posture, **do not** claim A1-D03 Tier 1 partial closure.

---

## 7. Relationship to Other Blockers

| Blocker | Relationship to A1-D03 Tier 1 |
|---------|-------------------------------|
| **N8 R13 / R7b** | Independent — drill does not satisfy R13 sign-off |
| **N5 real signer/RPC** | Out of scope — remains partial after Tier 1 |
| **N6 production-root e-stop** | Independent — not tested in Tier 1 |
| **A1-D04 reconciliation** | Must not regress — spot-check in execution gate |
| **A1-D05 audit durability** | Parallel open item — not closed by Tier 1 alone |
| **N9 R16 mocked scope** | Provides W3 confirm-before-write baseline |
| **Tier 2 / Tier 3** | **Not authorized** — require separate gates after Tier 1 PASS |
| **OR-20260630-008** | Unchanged **not_promoted** |

---

## 8. Explicit Non-Actions (This Gate)

| Non-action | Confirmed |
|------------|-----------|
| Execute A1-D03 crash drill (any tier) | **No** |
| Execute Tier 2 SIGKILL | **No** |
| Execute Tier 3 production-root interruption | **No** |
| Kill/interrupt production scanner/executor | **No** |
| Start scanner/executor loops | **No** |
| Modify code / config / `.env` | **No** |
| Use real RPC or real signer secrets | **No** |
| Enable live / arming / capital | **No** |
| R13 sign-off / OR promotion | **No** |
| Claim live/soak readiness | **No** |

---

## 9. Safety Confirmation

| Item | Value |
|------|-------|
| `.env` opened | **No** |
| Secrets inspected | **No** |
| `process.env` dumped | **No** |
| `executionMode` LIVE set | **No** |
| `dryRunMode` false set | **No** |
| `liveArmed` true set | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` set | **No** |
| Runtime processes started | **No** |
| Drill executed | **No** |
| Real RPC used | **No** |
| Real signer secrets used | **No** |
| OR-20260630-008 status | **not_promoted** |
| Promotion authorized | **No** |
| Live readiness claimed | **No** |
| Human soak readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

## 10. Recommended Next Gate

**A1-D03 Tier 1 Fixture Crash Drill Execution**

---

**Authorization authority:** Taylor Cheaney · A1-D03 Crash Drill Authorization gate (2026-07-06)
