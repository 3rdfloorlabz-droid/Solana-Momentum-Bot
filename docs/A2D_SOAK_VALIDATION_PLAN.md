# A2d — Supervisor Soak Validation Plan (Planning Only)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 4 of 4 (Phase 1 — Structure and Recovery)
**Status:** **Planning only** — this is an observation runbook; it changes no code, config, strategy, or posture, and adds no buttons, routes, or recovery execution.
**Operating constraint:** `PIPELINE_DRY_RUN` unchanged throughout; the soak runs the system exactly as it runs today

**Parent:** [A2_SUPERVISOR_PLAN.md](./A2_SUPERVISOR_PLAN.md) (L0 observe → L1 recommend → L2 human-confirmed → L3 autonomous) · [A2C_HUMAN_CONFIRMED_RECOVERY_PLAN.md](./A2C_HUMAN_CONFIRMED_RECOVERY_PLAN.md) (design A2d must validate before any execution)
**Validates the shipped work of:** A2a Supervisor Recommendations + A2b Recovery Advisor (read-only) · [M5_HEARTBEAT_PLAN.md](./M5_HEARTBEAT_PLAN.md) (heartbeat sources)
**Pattern:** [A1D_STABILITY_OBSERVATION_PLAN.md](./A1D_STABILITY_OBSERVATION_PLAN.md) (soak runbook structure)
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · `dashboard_server.js`

---

## 0. Scope separation (read first)

> **A2d validates that the *advice is accurate* before anyone is ever allowed to *act on it*.**

| ID | Owns | This document? |
|----|------|----------------|
| **M5** | Heartbeat visibility (HEALTHY/STALE/MISSING/NO DATA) | Validated (consumed) |
| **A2a** | Supervisor policy/state model (adds DEGRADED/FAILED) | Validated (consumed) |
| **A2b** | Recovery Advisor (manual runbook steps) | Validated (consumed) |
| **A2c** | Human-confirmed recovery *design* (eligibility, guardrails, audit) | Pre-condition for execution; **not executed here** |
| **A2d** (this doc) | **Long-duration soak that validates A2a/A2b accuracy** under real operation | **Yes** |
| **A2e** | Autonomous recovery (far future) | No |

A2d is the evidence gate between A2c (design) and any future execution capability. It runs the system normally for a long duration and **checks that the read-only supervisor signals tell the truth** — that HEALTHY/STALE/DEGRADED/FAILED classifications, and the recovery advice attached to them, match reality. It executes **no** recovery, adds **no** buttons or routes, and changes **nothing**.

> **Recovery must never outrun ownership.** A2d does not advance autonomy; it confirms the *observation* layer is trustworthy enough that a *future* human-confirmed layer (A2c) could be built on it.

---

## 1. Mission

Define a long-duration (recommended **72 hours**, minimum 24h) soak validation for the A2a/A2b read-only supervisor recommendations and recovery advisor, confirming the advisory layer is **accurate, conservative, and quiet** under normal `PIPELINE_DRY_RUN` operation — with **no code, no config, no execution, no autonomy**.

Why longer than A1d's 24h: A2d must observe **quiet periods** (no open paper trades), **infrastructure wobble** (public-RPC rate limits), and at least one **natural process gap** to confirm classifications behave correctly across the real operating envelope — which a single 24h window may not cover.

---

## 2. Constraints (planning-only footprint)

This document produces **only** `docs/A2D_SOAK_VALIDATION_PLAN.md`. During A2d the operator must **not**:

- change code, strategy, the executor, or any process file;
- change `PIPELINE_DRY_RUN`, `dryRunMode`, arming, `liveArmed`, or any gate;
- edit `live_config.json`, `.env`, or any config;
- add a button, POST route, action endpoint, or any state mutator;
- execute any recovery action from the dashboard; perform autonomous recovery;
- spawn, kill, or PID-check processes as part of validation (normal `start_fomo.ps1` startup is fine; deliberate fault-injection is a controlled, manual, operator step — see §6.4).

All checks are **manual read-only observations** (dashboard view, `--status`, `run_safety_tests.js`, file reads).

---

## 3. What A2d validates (target → method → pass condition)

| # | Validation target | How to observe | Pass condition |
|---|-------------------|----------------|----------------|
| V1 | **M5 heartbeat accuracy** | Compare each process's panel state to ground truth (terminal alive? last artifact write?) at each checkpoint | Panel state matches reality every check (alive→HEALTHY; stopped→STALE/MISSING after threshold) |
| V2 | **Supervisor state accuracy (A2a)** | Compare supervisor badge to derived M5 + M4 + A4 signals | Supervisor state correctly reflects base M5 state and any DEGRADED upgrade |
| V3 | **Recovery Advisor usefulness (A2b)** | For each unhealthy card, confirm diagnosis/steps/verify match the real situation and the documented commands | Advice is correct, actionable, and matches `start_fomo.ps1`/ops commands |
| V4 | **No false FAILED states** | Watch for any FAILED badge | **Zero** FAILED shown (A2a never auto-derives FAILED — any FAILED = defect) |
| V5 | **DEGRADED only for real impairment** | Each DEGRADED occurrence correlates with a real M4 DEGRADED/STALLED or A4 public-fallback signal | Every DEGRADED has a verifiable cause; no DEGRADED on a fully healthy process |
| V6 | **Executor advice stays conservative** | Inspect executor cards across states | Executor STALE/NO DATA/FAILED advice always says verify/`--status`/`panic.ps1`-first, human-confirmed; never "auto-restart" |
| V7 | **Wallet public-RPC warning correctness** | Cross-check wallet DEGRADED vs A4 RPC posture (`PUBLIC_FALLBACK_OBSERVATION_ONLY`) and Q9 warning | Wallet DEGRADED iff on public fallback; not flagged when a dedicated RPC is configured |
| V8 | **Paper Monitor quiet ≠ false panic** | During periods with no open paper trades, observe Paper Monitor card | STALE-via-proxy is labeled "may be quiet, not dead"; severity stays Low; no high-severity/FAILED escalation |
| V9 | **Dashboard remains read-only** | Inspect rendered HTML / routes | No buttons/forms/POST/onclick in supervisor or recovery sections; dashboard writes no authoritative state |
| V10 | **Safety suite 7/7** | `node run_safety_tests.js` at start and end | `7/7 safety tests passed` both times |
| V11 | **Posture stable** | `node live_executor.js --status` at every checkpoint | `PIPELINE_DRY_RUN`, `dryRunMode:true`, `liveArmed:false`, `PIPELINE_OBSERVING` every time |

---

## 4. Pre-run checklist (T-0)

From the repository root (confirm working directory is the repo root, not an archive folder).

1. **Posture:** `node live_executor.js --status` → expect `PIPELINE_DRY_RUN`, `dryRunMode:true`, `liveArmed:false`, `emergencyStop:false`. If any differ, **STOP**.
2. **Safety + guards:** `node run_safety_tests.js` → expect `7/7 safety tests passed`. If not, **STOP**.
3. **Dashboard read-only confirmation:** load `http://localhost:3000`; confirm the Supervisor Recommendations and Recovery Advisor sections render with the disclaimers and **no buttons/forms**.
4. **Record A4 RPC posture** at T0 (DEDICATED_READY vs PUBLIC_FALLBACK…) — needed to interpret wallet/executor DEGRADED later.
5. **Baseline note (scratch, not committed):** for each process — is it intended to be running this soak? (so MISSING is interpreted correctly).
6. **Record start time (UTC)** and target end (T+72h, or T+24h minimum).

---

## 5. Start commands

Use the existing launcher; A2d invents nothing.

```powershell
.\start_fomo.ps1     # Dashboard, Wallet Monitor, Scanner, Paper Monitor, Executor loop — PIPELINE_DRY_RUN-safe
```

Or per-process in separate terminals (for isolated logs): `node dashboard_server.js`, `node wallet_monitor.js`, `node scanner_gmgn_trending.js --watch`, `node monitor.js`, `node live_executor.js --loop`.

After start, re-run `node live_executor.js --status` once to confirm launch did not change posture.

---

## 6. Periodic checks (every ~3–4h during the soak)

Record each checkpoint in the operator scratch note (timestamp every row). None of these mutate state.

### 6.1 Posture + safety (V11)
```powershell
node live_executor.js --status     # PIPELINE_DRY_RUN / dryRunMode true / liveArmed false
```

### 6.2 Heartbeat & supervisor accuracy (V1, V2, V4, V5)
On `http://localhost:3000`, for each process (Scanner, Executor, Wallet Monitor, Paper Monitor, Dashboard):
- Confirm the **heartbeat** state matches reality (terminal alive? artifact recently written?).
- Confirm the **supervisor badge** matches (HEALTHY, or DEGRADED only with a real signal).
- **Flag immediately** any **FAILED** badge (V4 — none should ever appear) or any **DEGRADED** without a verifiable cause (V5).

### 6.3 Recovery Advisor correctness (V3, V6, V8)
For each unhealthy card present:
- Confirm the **diagnosis** matches the real situation and **steps** match the documented commands.
- **Executor (V6):** confirm advice is conservative (verify / `--status` / `panic.ps1`-first / human-confirmed); never "auto-restart."
- **Paper Monitor during quiet periods (V8):** when there are no open paper trades, confirm any STALE card is labeled "may be quiet, not dead," severity Low, no FAILED.

### 6.4 Optional, controlled fault-injection (manual, operator-driven)
To positively confirm classifications (not required, but strengthens evidence). Operator-performed, never automated:
- Stop **one low-risk process** (e.g., Wallet Monitor) via Ctrl-C → after its threshold, confirm it shows **STALE/MISSING** and the Recovery Advisor shows the correct restart card; then the operator manually restarts it (`node wallet_monitor.js`) and confirms it returns **HEALTHY**.
- Do **not** fault-inject the executor (high-risk); observe it only.
- Each fault-injection is a deliberate operator action recorded in the scratch note — it is **not** A2d executing recovery.

### 6.5 RPC warning correctness (V7)
Cross-check the **Wallet Monitor** state against the **Dedicated RPC Readiness (A4)** panel: wallet DEGRADED should appear **iff** posture is `PUBLIC_FALLBACK_OBSERVATION_ONLY`; if a dedicated RPC is configured, wallet should not be DEGRADED for RPC reasons.

### 6.6 Read-only confirmation (V9)
Periodically confirm the supervisor/recovery sections still contain **no** `<button>`, `<form>`, POST, or `onclick` (a quick page-source check). Confirm the dashboard has written no authoritative state.

---

## 7. End-of-run checks (T+72h, or T+24h minimum)

1. **Safety suite (V10):** `node run_safety_tests.js` → `7/7`.
2. **Posture (V11):** `node live_executor.js --status` → `PIPELINE_DRY_RUN`/`liveArmed:false`.
3. **Tally the checkpoint log** against V1–V11; compute false-positive / false-negative counts for each classification.
4. **Record final dashboard screenshots** (heartbeats, supervisor, recovery advisor, A4 RPC panel).
5. **Clean up** scratch notes (not committed).

---

## 8. Pass criteria (A2d succeeds when ALL hold)

- **V1** Heartbeat state matched reality at every checkpoint.
- **V2** Supervisor state matched derived signals at every checkpoint.
- **V3** Recovery Advisor diagnosis/steps/verify were correct and actionable for every unhealthy card observed.
- **V4** **Zero** FAILED badges appeared.
- **V5** Every DEGRADED had a verifiable impairment cause; no false DEGRADED.
- **V6** Executor advice was conservative in every observed state (no "auto-restart").
- **V7** Wallet public-RPC DEGRADED behaved correctly vs A4 posture.
- **V8** Paper Monitor quiet periods produced no false panic (Low severity, "may be quiet" labeling, no FAILED).
- **V9** Dashboard remained read-only (no buttons/forms/POST/onclick; no authoritative writes).
- **V10** Safety suite 7/7 at start and end.
- **V11** Posture `PIPELINE_DRY_RUN`/`liveArmed:false` at every checkpoint.

A passing A2d is **evidence that the advisory layer is accurate and conservative**. It is **not** authorization to execute recovery, build buttons, or trade.

---

## 9. Failure criteria (investigate / fix advisory logic; A2d fails if ANY)

- Any **FAILED** badge appears (A2a must never auto-derive FAILED).
- Any **DEGRADED** with no verifiable cause (false impairment), or a real impairment that is **not** flagged (missed DEGRADED).
- Heartbeat state contradicts reality (e.g., a dead process shows HEALTHY, or a live one shows MISSING).
- Executor advice ever suggests auto/unconditional restart, or omits the posture/`panic.ps1` safeguard.
- Wallet DEGRADED shown while a dedicated RPC is configured, or **not** shown while on public fallback.
- Paper Monitor quiet period escalates beyond Low / "may be quiet" (false panic).
- Any button/form/POST/onclick appears in the supervisor or recovery sections; the dashboard writes authoritative state.
- Safety suite < 7/7 at end; posture drifts from `PIPELINE_DRY_RUN`/`liveArmed:false`.

On failure: record the case, **do not** add execution or "fix" by acting — the remedy is an advisory-logic correction (a future A2a/A2b code change, separately scoped), not recovery execution.

---

## 10. Artifacts to inspect / not to commit

**Inspect (read-only):** dashboard panels (heartbeats, supervisor, recovery advisor, A4 RPC); `scanner_health.json`, `wallet_status.json`, `execution_audit.jsonl`, `paper_positions.json` (mtime), `rpc_health.json`; `--status` output; `run_safety_tests.js` output.

**Do not commit:** any runtime JSON/JSONL (gitignored); operator scratch notes and screenshots (store in the Obsidian vault / operator log, never in the repo). A2d's only committable artifact is this document (and optionally a written run report as a deliberate, reviewed commit).

---

## 11. What to record

A checkpoint table (time × V1–V11) plus: every DEGRADED occurrence with its verified cause; every fault-injection (what was stopped, observed state, restore result); any anomaly (false state, persisted issue) with timestamp; T0/T+end `--status` and `7/7` evidence; screenshots at T0, mid, T+end.

---

## 12. What qualifies A2d as complete

A2d is complete when a full soak (≥24h, recommended 72h) meets **every** §8 pass criterion — i.e., the A2a/A2b advisory layer is demonstrably **accurate, conservative, and quiet**, with zero false FAILED, no false DEGRADED, correct executor conservatism, correct wallet RPC behavior, no quiet-period false panic, a read-only dashboard, 7/7 safety, and stable `PIPELINE_DRY_RUN`/`liveArmed:false`.

**A2d completion is the evidence pre-condition for considering the A2c command-preview step.** It does **not** authorize recovery execution, buttons, autonomy, or live trading — each remains a separate, explicitly approved decision.

---

## 13. Negative verification (planning-only footprint)

```powershell
git status --short                 # expect only docs/A2D_SOAK_VALIDATION_PLAN.md
git diff --stat                    # expect no code/config changes
node live_executor.js --status     # PIPELINE_DRY_RUN, dryRunMode true, liveArmed false
node run_safety_tests.js           # 7/7
```

Pass = only this doc is new; no code/config diff; `--status` still `PIPELINE_DRY_RUN`/`liveArmed:false`; safety 7/7.

---

## 14. Do-not-do warnings (during the soak)

- ❌ no code/config/strategy/script change; ❌ no `live_config.json`/`.env` edit;
- ❌ no button, POST route, action endpoint, or state mutator;
- ❌ no recovery execution from the dashboard; ❌ no autonomous recovery;
- ❌ no executor fault-injection; ❌ no enabling LIVE / changing `PIPELINE_DRY_RUN`/arming;
- ❌ no committing runtime artifacts or scratch notes;
- ✅ allowed: read-only observation, `--status`/safety-test runs, and deliberate manual fault-injection of a **low-risk** process followed by a manual restore (recorded).

If a step requires any of the prohibited items, **stop — it is outside A2d.**

---

## 15. Relationship to A2a / A2b / A2c / A2e / live authorization

- **A2a/A2b:** the read-only layer A2d validates for accuracy.
- **A2c:** the human-confirmed *design* whose assumptions A2d's evidence supports (or refutes) before any execution step.
- **A2e:** autonomous recovery, far future — gated on A1 R3–R6 + A2d evidence + explicit approval; A2d does not advance it.
- **Live authorization:** **unrelated and forbidden.** A passing soak certifies advisory accuracy only — never permission to act, automate, or trade.

> **Structure precedes recovery. Recovery precedes promotion. Promotion precedes authorization. Humans authorize. Ori advises. Gates enforce.**

---

*A2d Supervisor Soak Validation (planning only) · TracktaOS Module 1 · Phase 1 Stabilization (Sprint 4) · Validates A2a/A2b advisory accuracy under long-duration `PIPELINE_DRY_RUN` operation. A2a = policy · A2b = advice · A2c = human-confirmed design · A2d = soak validation · A2e = autonomous (far future). No code, no config, no buttons, no routes, no recovery execution, no autonomy. Recovery must never outrun ownership. Posture verified 2026-06-22. TracktaOS stability has priority over automation.*
