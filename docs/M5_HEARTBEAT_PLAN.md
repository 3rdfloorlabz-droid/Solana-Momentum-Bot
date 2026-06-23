# M5 — Process Heartbeat Visibility (Plan)

**Sprint:** 3 (Reliability and Hardening)
**Task:** M5 (plan only — no code changes in this document)
**Goal:** Give operators a **read-only** way to tell whether each long-running TracktaOS process is **HEALTHY**, **STALE**, **MISSING**, or has **NO DATA** — without introducing supervision, restart, or process control.
**Reference:** [SPRINT_2_REVIEW.md](./SPRINT_2_REVIEW.md) (deferred work) · [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) (M5, rank 7) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) (no process supervisor / health checks) · pattern: [M4_SCANNER_HEALTH_PLAN.md](./M4_SCANNER_HEALTH_PLAN.md)

---

## 0. M5 vs A2 — different responsibilities

> **M5 answers: "Are the parts alive?"**
> **A2 (Supervisor, Sprint 4) answers: "What should happen if they are not?"**

| Concern | M5 (this plan) | A2 (Sprint 4) |
|---------|----------------|---------------|
| Detect liveness | ✅ Yes — heartbeat timestamps | Consumes M5 signals |
| Classify HEALTHY / STALE / MISSING / NO DATA | ✅ Yes (read-only) | — |
| Restart a dead process | ❌ **No** | ✅ Yes |
| Kill / control a process | ❌ **No** | ✅ Yes |
| Block automation on stall | ❌ **No** | ✅ Maybe (with A6) |
| Alerting / paging | ❌ No (visual only) | Possible later |

M5 is **observability**. It must not start, stop, restart, or gate any process. It only reads timestamps and renders status. If M5 ever appears to take an action, scope has leaked into A2.

---

## 1. What M5 is supposed to accomplish

Today the dashboard's `systemStatusPanel()` **hardcodes** process states:

```337:341:dashboard_server.js
        <div class="status-row"><span>SCANNER</span><strong class="${scannerCls}"><i></i>${escapeHtml(classified.label)}</strong></div>
        <div class="status-row"><span>MONITOR</span><strong><i></i>RUNNING</strong></div>
        <div class="status-row"><span>FOLLOWUP</span><strong><i></i>RUNNING</strong></div>
        <div class="status-row"><span>DASHBOARD</span><strong><i></i>ACTIVE</strong></div>
```

Only **SCANNER** reflects real state (via M4). `MONITOR`, `FOLLOWUP`, and `DASHBOARD` always read "RUNNING/ACTIVE" even when those processes are dead. That is a false-confidence surface. M5 replaces guesses with **timestamp-derived truth**.

| M5 does | M5 does not |
|---------|-------------|
| Read per-process heartbeat timestamps | Start/stop/restart any process |
| Classify HEALTHY / STALE / MISSING / NO DATA (read-only) | Supervise or enforce policy (A2) |
| Render a Process Heartbeat panel | Block automation or trades |
| Reuse existing artifacts where present (M4, wallet) | Add new runtime dependencies |
| Make `systemStatusPanel()` rows honest | Change executor / strategy / config / archive |

**Operator message after M5:** *"MONITOR — STALE: last cycle 4m ago (> 150s threshold). Process may be hung or stopped. M5 does not restart it."*

---

## 2. Long-running processes (inspected)

| # | Process | Entry | Loop cadence | Writes a timestamp today? |
|---|---------|-------|--------------|---------------------------|
| 1 | **Scanner** | `scanner_gmgn_trending.js --watch` | 60s (`WATCH_INTERVAL_MS`) | ✅ `scanner_health.json` → `lastScanAt`, `watchMode`, `scanIntervalMs` (M4) |
| 2 | **Executor** | `live_executor.js --loop` | 60s (`autonomousLoop(intervalMs = 60000)`) | ⚠ Indirect — `execution_audit.jsonl` `CYCLE_START`/`CYCLE_END` per cycle; no status snapshot file |
| 3 | **Wallet Monitor** | `wallet_monitor.js` | 30s balance (`BALANCE_INTERVAL_MS`) | ✅ `wallet_status.json` → `updatedAt` |
| 4 | **Paper Monitor** | `monitor.js` | 60s (`sleep(60000)`) | ❌ No heartbeat; rewrites `paper_trades.json` each cycle (mtime only) |
| 5 | **Dashboard** | `dashboard_server.js` | HTTP server; page auto-refresh 30s | ❌ No heartbeat; liveness is implicit (if you can load the page, it's up) |

**Conclusion:** Two processes already emit usable heartbeats (Scanner, Wallet), one is **derivable without code change** (Executor, via audit cycle timestamps), and two have a gap (Paper Monitor, Dashboard).

---

## 3. Status states (read-only classification)

Computed in the dashboard from the heartbeat timestamp + current clock — **never stored** (avoids a stale file reporting "HEALTHY").

> Note: the request lists the stale state as "STALED"; this plan uses **STALE** as the canonical label for the same state.

| State | Condition | Operator meaning |
|-------|-----------|------------------|
| **HEALTHY** | Heartbeat file parseable, timestamp present, `age ≤ staleThreshold` | Process alive and on schedule |
| **STALE** | Heartbeat file parseable, timestamp present, `age > staleThreshold` | Was running; now late, hung, or stopped — investigate (M5 does not act) |
| **MISSING** | Heartbeat file does not exist | Process never started this session, or never wrote a heartbeat |
| **NO DATA** | File exists but unparseable, or no usable timestamp field | Corrupt/partial write, or wrong schema |

**Decision order:** MISSING → NO DATA → STALE → HEALTHY.

**Important nuance (honesty):** M5 cannot prove a process is *running* — only that a heartbeat was *recently written*. A STALE/MISSING state means "no recent proof of life," not "confirmed dead." Panel copy must say so. True process-existence checks (PID liveness) belong to A2.

---

## 4. Stale thresholds

Pattern from M4: **stale if `age > 2 × interval`**, with a small buffer for cycle work and I/O.

| Process | Interval | Stale threshold | Rationale |
|---------|----------|-----------------|-----------|
| Scanner | 60s | **> 120s** | 2× watch interval (matches M4) |
| Executor | 60s | **> 150s** | 2× loop + cycle work (quote/build/sim adds latency) |
| Wallet Monitor | 30s | **> 90s** | 2× + RPC latency buffer |
| Paper Monitor | 60s | **> 150s** | 2× loop + DexScreener polling per open trade |
| Dashboard | 30s refresh | **> 90s** | 2× page-refresh / heartbeat interval |

Thresholds should be **per-process constants** in the dashboard reader (not hardcoded magic numbers scattered in markup), and where a process self-reports its interval (scanner `scanIntervalMs`), prefer `2 × reportedInterval + buffer` so the threshold tracks config.

---

## 5. Recommended file names and schema

The request specifies a uniform `*_status.json` set. Recommendation: **reuse existing artifacts where they already carry a heartbeat**, and adopt the uniform schema for the gaps — to avoid duplicate writes and extra I/O.

### 5.1 Canonical heartbeat schema (v1)

```json
{
  "schemaVersion": 1,
  "process": "executor",
  "role": "live_executor.js --loop",
  "pid": 12345,
  "startedAt": "2026-06-22T12:00:00.000Z",
  "lastHeartbeatAt": "2026-06-22T12:34:00.000Z",
  "heartbeatIntervalSec": 60,
  "cycleCount": 34,
  "lastActivity": "CYCLE_END: NO_CANDIDATE",
  "mode": "PIPELINE_DRY_RUN",
  "notes": null
}
```

| Field | Required | Purpose |
|-------|----------|---------|
| `schemaVersion` | ✅ | Reader compatibility (reject unknown like M4 does) |
| `process` | ✅ | Stable key: `scanner` / `executor` / `wallet_monitor` / `paper_monitor` / `dashboard` |
| `lastHeartbeatAt` | ✅ | The heartbeat — drives age/stale calculation |
| `heartbeatIntervalSec` | ✅ | Lets reader compute `2 × interval` threshold dynamically |
| `role` | optional | Human-readable command for the panel |
| `pid` | optional | Display only — **not** used for control |
| `startedAt` | optional | Uptime display |
| `cycleCount` | optional | Progress signal (is it actually iterating?) |
| `lastActivity` | optional | Last meaningful step (no secrets) |
| `mode` | optional | Echo of `executionMode` where relevant |
| `notes` | optional | Truncated free text; never secrets |

**Write discipline (for any new writer):** best-effort `writeFileSync`, wrapped in try/catch, never throws into the process loop — exactly the M4 / `wallet_status.json` pattern. No new dependencies.

### 5.2 Per-process source map

| Process | Canonical name | M5 recommendation | Source field |
|---------|----------------|-------------------|--------------|
| Scanner | `scanner_status.json` | **Reuse `scanner_health.json` (M4)** — do not duplicate | `lastScanAt` (+ `watchMode`, `scanIntervalMs`) |
| Executor | `executor_status.json` | **Derive from `execution_audit.jsonl`** (no executor change) — last `CYCLE_END`/`CYCLE_START` timestamp | audit tail timestamp |
| Wallet Monitor | `wallet_status.json` | **Reuse existing** | `updatedAt` |
| Paper Monitor | `monitor_status.json` | **Gap** — see § 5.3 | `lastHeartbeatAt` (new) or `paper_trades.json` mtime fallback |
| Dashboard | `dashboard_status.json` | Optional — dashboard liveness is implicit; may self-write on render | `lastHeartbeatAt` (dashboard self-write) |

### 5.3 The two gaps (conservative options)

**Paper Monitor (`monitor.js`)** — no heartbeat today. Two options, in order of preference:

- **Option A (read-only, zero process change):** Treat the **mtime of `paper_trades.json`** as a weak heartbeat proxy. Pros: no code change. Cons: mtime updates only when the monitor writes; a quiet monitor with no open trades may look STALE. Label clearly as a **proxy** → degrade to NO DATA semantics when uncertain.
- **Option B (minimal additive writer):** Add a small best-effort `monitor_status.json` write at the end of each monitor cycle. This touches `monitor.js` but is **additive and non-behavioral** (no strategy/exit logic change). Recommended if Option A proves misleading. **Flag for explicit approval** since it edits a process file.

**Executor (`live_executor.js`)** — constraint is **No executor changes**. Therefore M5 **must not** add an `executor_status.json` writer to the executor. Instead **derive** executor liveness from the existing `execution_audit.jsonl` `CYCLE_START`/`CYCLE_END` events (already written every loop). This is pure read-only reuse and respects the constraint. An `executor_status.json` writer would be a **future** item requiring approval, not part of M5.

**Dashboard (`dashboard_server.js`)** — the dashboard reading and rendering the panel *is itself* proof the dashboard is alive. A dedicated `dashboard_status.json` is optional; if added, the dashboard may write it on each render (in-scope, additive). Simplest M5: render `DASHBOARD — HEALTHY (rendering now)` directly.

**Net M5 implementation surface (preferred path):** **`dashboard_server.js` only** — a reader/classifier + panel that consumes `scanner_health.json`, `wallet_status.json`, `execution_audit.jsonl`, and `paper_trades.json` mtime. No executor, monitor, scanner, config, or archive changes. Option B (monitor writer) is an explicit, separately-approved add-on.

---

## 6. Dashboard presentation

### 6.1 New panel — `processHeartbeatPanel()`

Read-only, modeled on `scannerHealthPanel()` / `reconciliationPanel()`.

```
┌─ PROCESS HEARTBEATS ───────────────────────────────────────┐
│ Visibility only — M5 does not start, stop, or restart.     │
│                                                            │
│ Process        Status     Last beat   Threshold   Source   │
│ Scanner        HEALTHY    22s ago     120s        scanner_health.json
│ Executor       STALE      3m ago      150s        execution_audit.jsonl
│ Wallet Monitor HEALTHY    18s ago     90s         wallet_status.json
│ Paper Monitor  MISSING    —           150s        monitor (proxy)
│ Dashboard      HEALTHY    now         90s         self
│                                                            │
│ STALE/MISSING = no recent proof of life, not confirmed     │
│ dead. Restart decisions are A2 (Sprint 4), not M5.         │
└────────────────────────────────────────────────────────────┘
```

State badge classes mirror existing CSS tokens: HEALTHY → green (`wc-pos`/`positive`), STALE → amber (`wc-text-warn`), MISSING/NO DATA → red (`negative`). Reuse existing badge styling; add `.hb-*` classes only if needed.

### 6.2 Make `systemStatusPanel()` honest

Replace the hardcoded `MONITOR=RUNNING`, `FOLLOWUP=RUNNING`, `DASHBOARD=ACTIVE` rows with values derived from the same heartbeat reader. SCANNER already uses M4 — extend the pattern to the others. (FOLLOWUP = `near_miss_followup.js`, optional process; mark NO DATA if no heartbeat source — do not claim RUNNING.)

### 6.3 Placement recommendation

**Primary:** Insert `processHeartbeatPanel()` **immediately after `systemStatusPanel()`** and **before `scannerHealthPanel()`** in `renderDashboard()`. Rationale: liveness of *all* parts is the most top-level operational question; it frames the more detailed scanner/reconciliation/promotion panels below.

```text
systemStatusPanel()        ← made honest by M5 reader
processHeartbeatPanel()    ← M5 NEW (all five processes)
scannerHealthPanel()       ← M4 detail (scanner only)
phase1ReadinessPanel()
liveAutomationControlPanel()
reconciliationPanel()
promotionChecklistPanel()  ← M8
…
```

**Alternative:** fold heartbeats into `systemStatusPanel()` only (no separate panel). Lower visibility for per-process age/threshold detail; use only if a separate panel is considered redundant.

---

## 7. Risks

| Risk | Level | Mitigation |
|------|-------|------------|
| **Scope creep into supervision (A2)** | **High** | No start/stop/restart/kill anywhere; panel copy states "visibility only"; PR review rejects any process-control code |
| **False STALE on quiet processes** | Medium | Use `2× interval` thresholds; for monitor proxy, label uncertainty; prefer self-reported interval |
| **Heartbeat ≠ liveness** | Medium | Copy: "no recent proof of life, not confirmed dead"; true PID checks deferred to A2 |
| **Touching the executor** | **High** | Executor heartbeat is **derived** from `execution_audit.jsonl` — no `live_executor.js` edits |
| **Monitor writer edits process file** | Medium | Option A (mtime proxy) is read-only default; Option B requires explicit approval, additive only |
| **Clock skew / timezone** | Low | Use ISO UTC timestamps (existing convention); compute age from `Date.now()` |
| **Stale file reads mid-write** | Low | Best-effort parse; partial/corrupt → NO DATA, never crash |
| **New dependencies** | — | None — `fs`/`path` only, like existing panels |
| **Dishonest "RUNNING" persists** | Medium | Replace hardcoded rows in `systemStatusPanel()` as part of M5 |

---

## 8. Acceptance criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC1 | `processHeartbeatPanel()` renders all 5 target processes | Browser `http://localhost:3000` |
| AC2 | States limited to HEALTHY / STALE / MISSING / NO DATA | Code + visual review |
| AC3 | Scanner heartbeat reuses `scanner_health.json` (no duplicate file) | No new scanner write; reader uses `lastScanAt` |
| AC4 | Executor heartbeat derived from `execution_audit.jsonl` (no executor edit) | `git diff live_executor.js` empty |
| AC5 | Wallet heartbeat reuses `wallet_status.json` | Reader uses `updatedAt` |
| AC6 | Stale thresholds = ~2× interval per § 4 | Constants review |
| AC7 | No start/stop/restart/kill/control logic anywhere | Code review — supervision absent |
| AC8 | `systemStatusPanel()` no longer hardcodes RUNNING/ACTIVE for monitor/dashboard | Diff review |
| AC9 | Missing heartbeat → MISSING (not crash, not "RUNNING") | Delete/rename file; reload |
| AC10 | Corrupt heartbeat → NO DATA | Write partial JSON; reload |
| AC11 | Panel copy states "visibility only; M5 does not restart" | Visual |
| AC12 | No strategy / config / `PIPELINE_DRY_RUN` / archive changes | `git diff` scope |
| AC13 | `node --check dashboard_server.js` passes | Syntax |
| AC14 | `node run_safety_tests.js` 4/4; `--status` still `PIPELINE_DRY_RUN` | Smoke |
| AC15 | If Option B chosen, `monitor_status.json` write is additive/non-behavioral | Diff review + approval |

---

## 9. Verification commands

```powershell
cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot

# Syntax
node --check dashboard_server.js

# Safety suite + posture unchanged
node run_safety_tests.js              # expect 4/4
node live_executor.js --status        # expect PIPELINE_DRY_RUN, liveArmed: false

# Heartbeat sources present?
Test-Path .\scanner_health.json
Test-Path .\wallet_status.json
Test-Path .\execution_audit.jsonl

# Dashboard render
node dashboard_server.js
# Open http://localhost:3000 → Process Heartbeats panel after System Process Matrix
# Expect HEALTHY/STALE/MISSING/NO DATA badges; no control buttons

# Negative tests (read-only behavior)
# 1. Stop a process (Ctrl+C) → its row goes STALE after threshold, others unaffected
# 2. Rename wallet_status.json → Wallet Monitor shows MISSING
# 3. Truncate a heartbeat file mid-object → NO DATA (no dashboard crash)

# Confirm no executor change
git diff --stat
# Expect: dashboard_server.js (+ optional monitor.js if Option B approved, + docs)
# Expect: live_executor.js NOT modified
```

---

## 10. Summary

| Question | Answer |
|----------|--------|
| What does M5 add? | Read-only process heartbeat visibility for 5 processes |
| New states? | HEALTHY / STALE / MISSING / NO DATA |
| Touches executor? | **No** — executor liveness derived from `execution_audit.jsonl` |
| Minimal surface? | **`dashboard_server.js` only** (Option B monitor writer = separate approval) |
| Supervises or restarts? | **No** — that is A2 (Sprint 4) |
| New dependencies? | None |
| Fixes dishonest panel? | Yes — replaces hardcoded RUNNING/ACTIVE rows |

**M5 answers "Are the parts alive?" A2 answers "What should happen if they are not?" — different responsibilities, different sprints.**

---

*Sprint 3 M5 · Process heartbeat visibility · Read-only · No supervision · No restart · No executor changes*
