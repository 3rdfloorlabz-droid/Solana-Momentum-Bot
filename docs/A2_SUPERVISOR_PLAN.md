# A2 — Supervisor and Recovery Architecture (Planning Only)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 4 of 4 (Phase 1 — Structure and Recovery)
**Status:** **Planning only** — no code, no config, no scripts, no process control. This document defines *policy and architecture*; it builds nothing.
**Operating constraint:** `PIPELINE_DRY_RUN` unchanged; this milestone changes no runtime behavior

**Parent:** [A1_REVIEW.md](./A1_REVIEW.md) (A1 complete — ownership exists; recovery may now be designed) · [A1_UNIFIED_STATE_PLAN.md](./A1_UNIFIED_STATE_PLAN.md) (ownership model, races R1–R6) · [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) (no process supervisor / silent death)
**Consumes:** [M5_HEARTBEAT_PLAN.md](./M5_HEARTBEAT_PLAN.md) (heartbeat visibility) · [A4_DEDICATED_RPC_PLAN.md](./A4_DEDICATED_RPC_PLAN.md) (infra integrity) · [A3_CONFIG_CHANGE_AUDIT_PLAN.md](./A3_CONFIG_CHANGE_AUDIT_PLAN.md) (config accountability)
**Source truth:** [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [SPRINT_3_REVIEW.md](./SPRINT_3_REVIEW.md)

---

## 0. Scope separation (read first)

> **M5 answers: "Are the parts alive?"**
> **A1 answers: "Who owns each piece of state?"**
> **A2 answers: "What *should happen* when a part becomes unhealthy?"**
> **Live authorization answers: "May we move real capital?" — unrelated, and still NO.**

| Layer | Question it owns | This document? | May it act? |
|-------|------------------|----------------|-------------|
| **M5 — heartbeat visibility** | Is each process emitting recent proof of life? | Referenced (consumed) | No — read-only display |
| **A1 — ownership** | Who is the single writer of each state file? | Referenced (precondition) | No — structure only |
| **A2 — supervision & recovery policy** (this doc) | What recovery *policy* applies when a process is unhealthy, and at what autonomy level? | **Yes** | **Defines policy only — implements nothing** |
| **Live authorization** | May the bot arm and submit real trades? | **No — explicitly unrelated** | Forbidden |

A2 is a **policy and architecture** exercise. It classifies failures, defines recovery *recommendations*, and stages autonomy from **observe → recommend → human-confirmed → (future) autonomous**. It writes **no supervisor, no restart script, no PID kill, no process spawn, and no automatic repair.** Recovery that A2 *describes* at Level 2 is performed by a **human operator running existing commands** — not by any new automation.

**The governing constraint:** **Recovery must never outrun ownership.** A process may only ever be *autonomously* recovered (a future, unbuilt Level 3) once its state is provably single-writer and its restart is idempotent (A1). Until then, recovery is human-confirmed at most.

---

## 1. Mission

Define the **supervisor and recovery architecture** for TracktaOS: a staged autonomy model and a per-process failure/recovery policy that turns M5's liveness *visibility* into a disciplined *response plan* — **without** building supervision, and **without** ever coupling recovery to live authorization.

A1 made state ownership trustworthy. A2 designs how the system should *respond* to an unhealthy process — but only as far as **recommending** action and documenting **human-confirmed** recovery. Autonomous recovery is named, bounded, and explicitly deferred.

---

## 2. Constraints (planning-only footprint)

This document produces **only** `docs/A2_SUPERVISOR_PLAN.md`. During A2 planning the work must **not**:

- change code, strategy, exits, filters, the executor, or any process file;
- change `PIPELINE_DRY_RUN`, `dryRunMode`, arming, `liveArmed`, or any safety gate;
- edit `live_config.json`, `.env`, or any config;
- **write any supervisor, watchdog, restart script, or scheduler**;
- **kill, signal, or spawn** any process; perform **any PID control**;
- perform **automatic repair** of any file or state;
- move, rename, delete, or compress any file; create no `archive/` or `data/` folder;
- add a dependency, database, or state service.

See §15 for the explicit do-not-implement list. All verification is read-only (`--status`, `run_safety_tests.js`, dashboard view).

---

## 3. Inspection findings (what already exists)

Enumerated from source on 2026-06-22 (`dashboard_server.js`, `live_executor.js`, `scanner_gmgn_trending.js`, `monitor.js`, `wallet_monitor.js`) plus M5/A1/A4 plans.

### 3.1 Supervised processes and their existing heartbeat sources

| Process | Entry | Cadence | Heartbeat source (M5, shipped) | Owns which state (A1) |
|---------|-------|---------|-------------------------------|------------------------|
| **Scanner** | `scanner_gmgn_trending.js --watch` | 60s | `scanner_health.json · lastScanAt` | `paper_trades.json` (append-only), `pipeline_candidates.jsonl`, `near_misses.json`, `scanner_health.json` |
| **Executor** | `live_executor.js --loop` | 60s | `execution_audit.jsonl · CYCLE_END` (derived) | `live_config.json` (atomic), `live_positions.json`, `observation_dedup.json`, `live_trades.jsonl`, audit ledgers |
| **Wallet Monitor** | `wallet_monitor.js` | 30s | `wallet_status.json · updatedAt` | `wallet_status.json`, `rpc_health.json`, `wallet_history.jsonl` |
| **Paper Monitor** | `monitor.js` | 60s | `paper_positions.json · mtime` (proxy) | `paper_positions.json` (A1a single-writer) |
| **Dashboard** | `dashboard_server.js` | HTTP + 30s refresh | `self (internal)` | none — pure reader/derived view |

### 3.2 Failure states already *visible* today (M5, read-only)

M5 already classifies four states per process: **HEALTHY / STALE / MISSING / NO DATA** (`classifyHeartbeat`, `buildHeartbeatContext`, `processHeartbeatPanel`). Thresholds are ~2× cadence (scanner 120s, executor 150s, wallet 90s, paper 150s, dashboard 90s). M5 explicitly **does not** act; its panel copy says "recent proof of life, not process control."

Additional existing visibility A2 can consume (no new code):
- **A4 RPC posture** — `DEDICATED_READY / PUBLIC_FALLBACK_OBSERVATION_ONLY / MISSING_DEDICATED_RPC / UNKNOWN` (infrastructure health distinct from liveness).
- **M4 scanner health** — `HEALTHY / DEGRADED / STALLED` + quiet-result note.
- **A3 config audit** — `config_change_audit.jsonl` records control-plane config changes (relevant to "config drift" detection).
- **Reconciliation** — `pending_reconciliation.jsonl` + reconciliation panel (ambiguous outcomes).
- **`--status`** — authoritative posture (`PIPELINE_DRY_RUN`, `liveArmed`, gates).

### 3.3 Existing control / recovery surfaces (human-operated, already present)

A2 recovery at Level 2 reuses these — it invents nothing:

| Surface | Effect | Safety |
|---------|--------|--------|
| `start_fomo.ps1` | Launch all processes | Preserves `PIPELINE_DRY_RUN` |
| `stop_fomo.ps1` | Stop helper (verify behavior) | Graceful stop |
| `node <process>.js` | Restart a single process in its own terminal | Operator-driven |
| `panic.ps1` | `emergencyStop=true`, halt, log `panic_events.jsonl` | Atomic config write (A1b) |
| `reset_after_panic.ps1` | Interactive post-panic reset (typed `YES`) | Keeps automation off |
| `emergency_stop.js` / `reset_live_safety.js` | Kill switch / clear stop | Atomic (A1b), audited (A3) |

**Key finding:** the *mechanisms* for recovery already exist and are human-operated and safety-checked. A2's contribution is **policy** — *when* to use them, *who* decides, and *what evidence* justifies each — not new tooling.

### 3.4 Which failures are recoverable vs require human intervention

| Failure class | Recoverable by restart? | Why |
|---------------|-------------------------|-----|
| **Visibility/observation process down** (Dashboard, Wallet Monitor) | **Yes — low risk** | Pure readers/snapshot writers; restart moves no capital and cannot corrupt authoritative trade state |
| **Scanner down** | **Yes — low risk** | Single-writer append-only ledger (A1a); restart re-appends, never rewrites; idempotent enough |
| **Paper Monitor down** | **Yes — low risk** | Single-writer of `paper_positions.json` (A1a, atomic); restart re-seeds idempotently from the ledger |
| **Executor down** | **Human-confirmed only** | Owns `live_positions.json` / `observation_dedup.json` (R3/R4 **not** yet atomic — future state module); restart timing interacts with dedup/positions; needs judgment even in dry-run |
| **State corruption** (parse error on an authoritative file) | **Human only — no restart** | Restart cannot fix corruption; may worsen it. Requires inspection + A1-style repair/fold-back |
| **Posture drift** (`liveArmed` unexpectedly true, config drift) | **Human only — immediate** | Safety event; use `panic.ps1`. Never auto-handled |
| **Reconciliation backlog growth** | **Human only** | Ambiguous on-chain outcomes need a human decision (A6 territory) |

---

## 4. Supervision autonomy levels

A2 stages autonomy. **Only Level 0 exists today (M5). A2 plans Level 1 and Level 2. Level 3 is named and explicitly NOT implemented.**

| Level | Name | What it does | What it must NOT do | Status |
|-------|------|--------------|---------------------|--------|
| **L0** | **Observe only** | Detect + classify liveness/health from heartbeats and existing artifacts; display states. | Recommend, act, restart, or gate anything. | **Shipped (M5).** |
| **L1** | **Recommend action** | For each unhealthy state, surface a **read-only recommendation** ("Executor STALE 3m — likely hung; recommended: verify terminal, then human-confirmed restart"). Advisory text only. | Execute any action; click anything; change state. | **A2-impl (future, separately approved).** |
| **L2** | **Human-confirmed recovery** | Provide a **runbook + (optionally) a guarded operator action** that a human **explicitly confirms**, which then invokes an **existing** safe command (`start_fomo.ps1`, single-process restart, `panic.ps1`). The human is the authority for every action. | Act without explicit per-incident human confirmation; recover contested/non-owned state; touch arming. | **A2-impl (future, separately approved).** |
| **L3** | **Autonomous recovery** | A supervisor that restarts a **provably idempotent, single-writer** process on confirmed failure, within strict policy, with full audit — **no human in the loop for that narrow action.** | Recover the executor or any non-atomic-state owner; arm trading; act while A1 races R3–R6 remain open; exceed restart budgets. | **NOT implemented. Deferred. Gated on A1 completeness (R3–R6) + soak evidence + explicit approval.** |

**Autonomy ratchet:** the system advances L0→L1→L2→L3 **one level at a time**, each gated by evidence and human approval. A2 does not skip to autonomy. **No level grants authorization to trade.**

---

## 5. Health state model (six states)

A2 extends M5's four read-only liveness states with two **health** states. M5's four describe *proof of life*; A2 adds **DEGRADED** (alive but impaired) and **FAILED** (confirmed not functioning) — both requiring stronger evidence than a timestamp.

| State | Definition | Evidence required | Source of truth |
|-------|------------|-------------------|-----------------|
| **HEALTHY** | Recent proof of life; on schedule | Heartbeat `age ≤ threshold` | M5 (`classifyHeartbeat`) |
| **STALE** | Was alive; now late | Heartbeat `age > threshold` | M5 |
| **MISSING** | Expected heartbeat artifact absent | File does not exist | M5 |
| **NO DATA** | Artifact present but unreadable/no timestamp | Parse fail / missing field | M5 |
| **DEGRADED** | **Process alive (HEALTHY heartbeat) but impaired** — producing reduced/untrusted output | HEALTHY heartbeat **AND** an impairment signal (e.g., M4 `DEGRADED/STALLED`, A4 public-fallback/`MISSING_DEDICATED_RPC`, repeated `gmgn-cli` errors, scanner 0 results over N cycles, RPC rate-limit warnings) | A2 (composes M5 + M4 + A4 + error signals) |
| **FAILED** | **Confirmed not functioning** — not merely "no recent proof of life" | Strong evidence: explicit crash/exit, repeated error signatures in `live_errors.jsonl`/console, **or** read-only PID-liveness check shows the process absent, **or** operator confirmation | A2 (requires more than STALE) |

### 5.1 Honesty rules (carried from M5, hardened for A2)

- **STALE ≠ FAILED.** STALE means "no recent proof of life." Escalating STALE → FAILED requires **additional** evidence (crash log, exit, or a read-only PID-existence check). A2 must never *assume* dead from silence.
- **PID-liveness is read-only and is a future capability.** A read-only "does this PID exist?" check (to justify FAILED) is *allowed in concept* for L2/L3 but is **not built in A2 planning**, and is distinct from — and never escalates to — PID **killing** (forbidden).
- **DEGRADED is alive.** A DEGRADED process must not be "recovered" by restart by default; the impairment is usually infrastructure (A4) or upstream (GMGN), not the process. Restarting a DEGRADED process can hide the real cause.
- **Infra degraded ≠ bot failed** (A4 principle 4). Public-RPC rate limiting reads DEGRADED, not FAILED.

---

## 6. Per-process supervision specification

For each process: **role**, then each relevant state → **symptoms → likely causes → recommended action (level) → escalation**. All recommended actions are **advisory (L1)** or **human-confirmed (L2)**; none are autonomous.

### 6.1 Scanner (`scanner_gmgn_trending.js --watch`)

Role: discovery; single-writer append-only ledger owner (A1a). **Recoverable — low risk.**

| State | Symptoms | Likely causes | Recommended action | Escalation |
|-------|----------|---------------|--------------------|------------|
| STALE | `scanner_health.json lastScanAt` > 120s | Process hung, killed, network stall, `gmgn-cli` blocking | **L1:** flag "Scanner STALE — verify terminal." **L2:** human-confirmed restart `node scanner_gmgn_trending.js --watch` | If STALE persists after restart → DEGRADED investigation (GMGN/auth) |
| MISSING | No `scanner_health.json` | Never started this session | **L1:** "Scanner not started." **L2:** start via `start_fomo.ps1` or single command | — |
| NO DATA | `scanner_health.json` unparseable | Partial write / corruption | **L1:** "Scanner health unreadable." **L2:** inspect file; restart scanner (append-only ledger is safe) | If corruption recurs → human file inspection |
| DEGRADED | HEALTHY beat but M4 `DEGRADED/STALLED`, repeated `gmgn-cli` failures, or 0 results over many cycles | GMGN API/auth (`GMGN_API_KEY`), upstream outage, rate limits | **L1:** "Scanner DEGRADED — check GMGN CLI/key; do NOT restart blindly." **L2 (human judgment):** verify `gmgn-cli`, restart only if warranted | Upstream outage → wait/notify; not a restart problem |
| FAILED | Crash/exit, repeated fatal errors | Unhandled exception, missing dependency | **L1:** "Scanner FAILED — restart recommended (safe; append-only)." **L2:** human-confirmed restart | Repeated FAILED → human root-cause |

### 6.2 Executor (`live_executor.js --loop`)

Role: pipeline observation; owner of config + positions + dedup (some still non-atomic, R3/R4). **Human-confirmed recovery ONLY — never autonomous in A2/early A2-impl.**

| State | Symptoms | Likely causes | Recommended action | Escalation |
|-------|----------|---------------|--------------------|------------|
| STALE | `execution_audit.jsonl CYCLE_END` > 150s | Loop hung, long RPC stage, killed | **L1:** "Executor STALE — verify before restart (owns positions/dedup)." **L2:** human-confirmed restart `node live_executor.js --loop` **after** confirming no in-flight cycle | Persistent STALE → human inspection of audit tail |
| MISSING | No recent audit cycles | Executor not in loop (only `--status` run) | **L1:** "Executor loop not running." **L2:** start loop (human) | — |
| NO DATA | Audit tail unparseable | Corrupt/partial audit append | **L1:** "Executor audit unreadable." **L2:** **human inspection first** — do not auto-restart | Corruption → A1-style review |
| DEGRADED | Alive but A4 `MISSING_DEDICATED_RPC` / public fallback, or repeated `SIMULATION_FAILED`/`PRIORITY_FEE_UNAVAILABLE` in `live_errors.jsonl` | Missing dedicated RPC, infra rate limits | **L1:** "Executor DEGRADED — infrastructure, not process. Fix RPC; do NOT restart to 'fix' it." | Infra → A4 remediation (human/provisioning) |
| FAILED | Crash/exit or repeated fatal cycle errors | Unhandled exception, config parse error | **L1:** "Executor FAILED — human-confirmed restart; verify posture after." **L2:** human restart, then `--status` must show `PIPELINE_DRY_RUN`/`liveArmed:false` | If FAILED ties to config/state corruption → **panic.ps1**, human repair |

> **Executor special rule:** because R3 (`observation_dedup.json`) and R4 (`live_positions.json`) are **not yet atomic single-writer-safe** (future state module), the executor is **excluded from any autonomous recovery (L3)** until that work lands. Recovery must never outrun ownership.

### 6.3 Wallet Monitor (`wallet_monitor.js`)

Role: balance/RPC snapshots; snapshot/cache writer. **Recoverable — low risk.**

| State | Symptoms | Likely causes | Recommended action | Escalation |
|-------|----------|---------------|--------------------|------------|
| STALE | `wallet_status.json updatedAt` > 90s | Process down, RPC stall | **L1:** "Wallet Monitor STALE." **L2:** human-confirmed restart `node wallet_monitor.js` | Persistent → check RPC |
| MISSING | No `wallet_status.json` | Not started | **L1/L2:** start | — |
| NO DATA | Unparseable status | Partial write | **L1:** flag. **L2:** restart (snapshot is rebuildable) | — |
| DEGRADED | Alive but public-RPC fallback / rate-limit warnings (Q9), `rpc_health.json` poor | Public RPC, no dedicated endpoint (A4) | **L1:** "Wallet Monitor DEGRADED — public RPC; expect false DISCONNECTED. Infra, not process." Do NOT restart to fix | A4 remediation |
| FAILED | Crash/exit | Exception, RPC client error | **L1:** "FAILED — restart safe." **L2:** human restart | Repeated → root-cause |

### 6.4 Paper Monitor (`monitor.js`)

Role: paper lifecycle; single-writer of `paper_positions.json` (A1a, atomic). **Recoverable — low risk; idempotent re-seed.**

| State | Symptoms | Likely causes | Recommended action | Escalation |
|-------|----------|---------------|--------------------|------------|
| STALE | `paper_positions.json mtime` > 150s | Down, hung, or **quiet (no open trades)** — proxy limitation | **L1:** "Paper Monitor STALE (mtime proxy — may be quiet, not dead)." **L2:** verify terminal; restart if needed | Distinguish quiet vs dead before acting |
| MISSING | No `paper_positions.json` (and ledger present) | Not started, or pre-seed | **L1:** "Paper Monitor not started." **L2:** start `node monitor.js` (re-seeds idempotently from ledger) | — |
| NO DATA | `paper_positions.json` unparseable | Partial write | **L1:** flag. **L2:** restart (re-seed) or human inspect | Recurrent → inspect |
| DEGRADED | Alive but repeated DexScreener price-fetch failures / NEEDS_REVIEW spikes | Pricing API issues, anomaly guard firing | **L1:** "Paper Monitor DEGRADED — pricing/anomaly; review, don't blind-restart." | Pricing outage → wait/notify |
| FAILED | Crash/exit | Exception | **L1:** "FAILED — restart safe (idempotent re-seed)." **L2:** human restart | Repeated → root-cause |

### 6.5 Dashboard (`dashboard_server.js`)

Role: pure reader / derived views. **Recoverable — lowest risk; no authoritative state.**

| State | Symptoms | Likely causes | Recommended action | Escalation |
|-------|----------|---------------|--------------------|------------|
| STALE / FAILED | Page won't load; port 3000 unresponsive | Process down, port conflict, exception | **L1:** "Dashboard down." **L2:** human restart `node dashboard_server.js`; check port 3000 | Port conflict → human resolve |
| NO DATA (panels) | Panels show NO DATA/MISSING | Source artifacts absent (other processes down) | **L1:** "Dashboard healthy; sources missing — see heartbeats." Do NOT restart dashboard to fix source gaps | Fix the *source* process, not the dashboard |

> Dashboard "NO DATA" almost always indicates an *upstream* process problem, not a dashboard problem — A2 must point the operator at the real cause (the heartbeat panel), not at restarting the reader.

---

## 7. Escalation matrix

| State | Severity | Default level | Action authority | Default action |
|-------|----------|---------------|------------------|----------------|
| HEALTHY | none | L0 | — | none |
| STALE | low–med | L1 → L2 | Human | Investigate; human-confirmed restart of **recoverable** processes; executor needs verification first |
| MISSING | low | L1 → L2 | Human | Start the process (existing command) |
| NO DATA | med | L1 → L2 | Human | Inspect file; restart only **recoverable** processes; **never** auto-restart executor on NO DATA |
| DEGRADED | med | L1 | Human | Diagnose **infrastructure/upstream** (A4/GMGN/pricing); **do not** restart to mask it |
| FAILED | high | L1 → L2 | Human | Human-confirmed restart of recoverable processes; executor/state-corruption → inspect, possibly `panic.ps1` |
| **Posture drift / `liveArmed` unexpectedly true / config drift** | **critical** | **Human only** | **Human, immediately** | **`panic.ps1`**, then human investigation — never any autonomous handling |
| **Authoritative-state corruption** | **critical** | **Human only** | **Human** | Stop affected process; inspect; A1-style repair/fold-back; no restart-as-repair |

**Escalation discipline:** L1 may *recommend* an L2 action, but the **human performs and authorizes** it. Nothing escalates to autonomous action in A2. Critical rows never leave human hands.

---

## 8. Principles

1. **Recovery never outruns ownership.** Autonomous recovery (L3) is permitted *only* for processes whose state is provably single-writer + atomic (A1) and whose restart is idempotent. The executor is excluded until R3–R6 land.
2. **Observation precedes action.** Every action level builds on a *confirmed* health classification. No action on ambiguous evidence (STALE ≠ dead).
3. **Humans authorize action; the supervisor recommends.** Through L2, a human confirms every recovery. (Mirrors "Ori advises. Humans authorize. Gates enforce.")
4. **Restart is not repair.** Restarting a process never fixes corrupted state or degraded infrastructure; A2 must route corruption/infra to human inspection, not restart loops.
5. **Idempotent recovery only.** A recovery action must be safe to repeat (e.g., paper monitor re-seeds from the ledger). Non-idempotent recovery is forbidden.
6. **Bounded autonomy (future).** Any L3 action operates within explicit budgets (max restarts / window, backoff) and full audit; exceeding budget escalates to human, never to harder action.
7. **Supervision is never authorization.** No supervision level — including future L3 — may arm trading, change `PIPELINE_DRY_RUN`, or weaken a gate. A supervised system is not an armed system.
8. **Degraded infrastructure is not process failure.** A4-class impairments (public RPC, missing dedicated endpoint) are DEGRADED, handled by remediation, not restart.
9. **Single source of posture truth.** Recovery decisions read posture from `--status`/gates, never from telemetry or derived views (A1 principle 6/7).

---

## 9. Separation of observation and action

| Plane | Owns | Mechanism | May change state? |
|-------|------|-----------|-------------------|
| **Observation** (L0 / M5 + A2 classification) | Detect & classify HEALTHY…FAILED | Read heartbeats + M4/A4/error signals | **No** |
| **Recommendation** (L1) | Map state → suggested response | Advisory text on dashboard / report | **No** |
| **Action** (L2) | Execute recovery | **Human** runs existing command after explicit confirm | Yes — by human authority |
| **Autonomy** (L3, future) | Narrow auto-restart | Supervisor (unbuilt) within budget + audit | Yes — only for idempotent single-writer processes, never executor/arming |

The boundary that must never blur: **classification and recommendation are read-only; action requires a human (until a future, separately-approved L3 for a strictly bounded subset).**

---

## 10. Risks

| Risk | Severity | Mitigation in this design |
|------|----------|----------------------------|
| Scope creep into building a supervisor now | **High** | Planning only (§2, §15); A2 ships a document, not a daemon |
| Auto-restarting the executor reintroduces races | **High** | Executor excluded from L3 until R3–R6 (A1) land (Principle 1) |
| Treating STALE as dead → needless restarts | Medium | FAILED requires extra evidence; STALE≠FAILED (§5.1) |
| Restarting DEGRADED process masks infra cause | Medium | DEGRADED = diagnose infra, not restart (Principle 4/8) |
| Recovery loop fighting a crash-looping process | Medium | Bounded autonomy + backoff (future L3); human escalation (Principle 6) |
| Supervision misread as a step toward live | **High** | Principle 7; explicit "unrelated to live authorization" (§0, §16) |
| Restart-as-repair on corrupted state | **High** | Corruption → human inspection, never restart (§7 critical rows) |
| PID checks drifting into PID killing | Medium | PID-liveness is read-only and unbuilt; killing forbidden (§5.1, §15) |
| Quiet paper monitor false STALE | Low | Proxy-limitation noted; verify quiet vs dead before action (§6.4) |

---

## 11. Acceptance criteria (A2 planning)

A2 **planning** is complete when this document:

1. Identifies the supervised processes, their cadences, heartbeat sources, and A1 ownership. ✅ (§3.1)
2. Enumerates failure states already visible (M5 + M4 + A4 + reconciliation + `--status`). ✅ (§3.2)
3. States which failures are recoverable vs human-only, and the observation/action separation. ✅ (§3.4, §9)
4. Defines the four autonomy levels (L0 observe, L1 recommend, L2 human-confirmed, L3 future autonomous — not implemented). ✅ (§4)
5. Defines all six states — HEALTHY, STALE, MISSING, NO DATA, DEGRADED, FAILED — with evidence requirements. ✅ (§5)
6. Provides per-process specs (Scanner, Executor, Wallet Monitor, Paper Monitor, Dashboard) with symptoms, likely causes, recommended actions, escalation. ✅ (§6)
7. Provides an escalation matrix and design principles, including "recovery never outruns ownership." ✅ (§7, §8)
8. Keeps A2 (supervision/recovery policy) separate from M5 (visibility), A1 (ownership), and live authorization (unrelated). ✅ (§0, §16)
9. Adds **no code, no script, no PID control, no spawn, no auto-repair, no dependency, no database**; leaves posture `PIPELINE_DRY_RUN` / `liveArmed:false` unchanged. ✅ (§2, §15, verified §13)

---

## 12. Future phases (out of scope here — separate approval each)

| Phase | Work | Gated by |
|-------|------|----------|
| **A2-impl L1** | Read-only **recommendation** layer on the dashboard (state → advisory text); no actions, no buttons | This plan's approval |
| **A2-impl L2** | Documented recovery **runbook** + optional guarded operator action invoking **existing** commands, with per-incident human confirmation | L1 stable; A1d soak evidence |
| **A2-impl L3** | Narrow **autonomous** restart for idempotent single-writer processes (scanner/paper/wallet/dashboard) within budgets + audit; **executor excluded** | A1 R3–R6 resolved (future state module) + extended soak + explicit approval |
| **PID liveness (read-only)** | Optional read-only process-existence check to justify FAILED (never kill) | Separate approval |
| **Alerting** | Notify on FAILED/critical (paging) | Post-L1 |

Each phase is a **separate, explicitly approved** step. None is authorized by this plan.

---

## 13. Negative verification (planning-only footprint)

```powershell
# Confirm only this doc is new:
git status --short                 # expect only docs/A2_SUPERVISOR_PLAN.md
git diff --stat                    # expect no code/config changes

# Posture unchanged (read-only):
node live_executor.js --status     # PIPELINE_DRY_RUN, dryRunMode true, liveArmed false
node run_safety_tests.js           # 7/7 (no regression)
```

Pass = only `docs/A2_SUPERVISOR_PLAN.md` is added; no process/config/strategy diff; `--status` still `PIPELINE_DRY_RUN` / `liveArmed:false`; safety suite 7/7.

---

## 14. What qualifies A2 (planning) as accepted

A2 planning is accepted when §11 ACs hold and the document defines the staged-autonomy model, the six-state health model, and the per-process recovery policy — **without building anything**. A2 *implementation* (L1, then L2, then much later L3) proceeds only as separately approved phases (§12), each preserving `PIPELINE_DRY_RUN` and never coupling to live authorization.

---

## 15. Do-not-implement warnings (planning phase)

A2 planning, and any future A2 implementation up to the approved level, must **never**:

- ❌ write a supervisor, watchdog, scheduler, or restart script during planning;
- ❌ kill, signal, or spawn any process; perform any PID **control** (read-only PID *existence* check is a future, separately-approved capability, never killing);
- ❌ perform **automatic repair** of any file or state (restart is not repair);
- ❌ auto-recover the **executor** or any non-atomic-state owner (R3–R6) — recovery must not outrun ownership;
- ❌ enable `LIVE`, change `PIPELINE_DRY_RUN` / `dryRunMode` / `liveArmed`, or weaken any gate;
- ❌ edit `live_config.json`, `.env`, strategy, exits, or thesis bounds;
- ❌ add a dependency, database, or state service; move/rename/delete archives or create `data/`;
- ❌ treat supervision as a path to authorization.

If a proposed change does any of the above, it is **outside A2** — stop and re-scope.

---

## 16. Relationship to M5 / A1 / A3 / A4 / live authorization

- **M5 (liveness):** A2 *consumes* M5's HEALTHY/STALE/MISSING/NO DATA. A2 adds DEGRADED/FAILED and the response policy. M5 stays read-only.
- **A1 (ownership):** A2's safety depends on A1. Autonomous recovery is bounded by which processes are single-writer + atomic. **Recovery never outruns ownership.**
- **A3 (config audit):** A2 reads `config_change_audit.jsonl` to detect config drift; any recovery touching config still goes through A1b atomic writes + A3 audit. A2 adds no config writes.
- **A4 (infra integrity):** A2 maps A4 posture into DEGRADED; infra impairment is remediated, not restarted away.
- **Live authorization:** **Unrelated and forbidden.** No supervision level arms trading. Promotion remains gated on the separate pre-live items; a supervised system is not an authorized one.

> **Structure precedes recovery. Recovery precedes promotion. Promotion precedes authorization. Humans authorize. Ori advises. Gates enforce.**

---

*A2 Supervisor and Recovery Architecture (planning only) · TracktaOS Module 1 · Phase 1 Stabilization (Sprint 4) · Consumes M5 liveness + A1 ownership; defines staged autonomy (L0 observe → L1 recommend → L2 human-confirmed → L3 future, unbuilt) and a six-state health model. Safe default: `PIPELINE_DRY_RUN`, no live submission. A2 = supervision & recovery policy · M5 = heartbeat visibility · A1 = ownership · live authorization = unrelated. No code, no scripts, no PID control, no spawn, no auto-repair, no dependency, no database. Recovery must never outrun ownership. Posture verified 2026-06-22. TracktaOS stability has priority over automation.*
