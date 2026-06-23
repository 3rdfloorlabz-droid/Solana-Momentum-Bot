# A3 — Config Change Audit Requirements Plan (Planning Only)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 3 of 4 (Phase 1 — Reliability and Hardening)
**Status:** Planning only — **no code, no config edits, no live enablement, no dependencies**
**Operating constraint:** `PIPELINE_DRY_RUN` unchanged; this milestone changes no runtime behavior

**Inputs:** `live_config.json` · `live_executor.js` · `dashboard_server.js` · `start_fomo.ps1` · `panic.ps1` · `reset_after_panic.ps1` · `reset_live_safety.js` · [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) (A3) · [SPRINT_2_REVIEW.md](./SPRINT_2_REVIEW.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [DECISIONS.md](./DECISIONS.md) · [../ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md)

---

## 0. What this milestone is — and is not

A3 defines the **requirements for auditing safety-relevant configuration changes** — *what* must be recorded when `live_config.json` changes, *which* fields demand an explicit operator reason, and *what* must stay human-only. It is a **requirements document**. It does not implement the audit, does not create `config_change_audit.jsonl`, and does not change how config is read, written, or validated.

> **A3 records what changed and why. It does not block changes, auto-mutate config, or make writes atomic.** Enforcement belongs to safety gates / A6; atomic single-writer config belongs to A1; supervision belongs to A2.

### Responsibility separation (must remain separate)

| Milestone | Responsibility | This doc |
|-----------|---------------|----------|
| **M5** | **Liveness** — are processes alive? | referenced |
| **A3** (this doc) | **Config change audit** — record safety-relevant config changes + reason | ✅ defines requirements |
| **A4** | **Infrastructure integrity** — dedicated RPC trust | referenced |
| **A1** | **Unified state** — atomic writes, single writer (incl. config) | out of scope |
| **A2** | **Supervisor** — restart/safe-mode | out of scope |

A3 is an **observability** layer for configuration. It answers *"who changed what safety field, when, from where, and why?"* — it never decides whether a change is *allowed* (gates do that) and never *makes* a change on its own.

---

## 1. Current config write surface (observed truth)

`live_config.json` (root) is the operational config. Enumerated writers on 2026-06-22:

| # | Writer | What it changes | Atomic? | Currently audited to | Reason captured? |
|---|--------|-----------------|---------|----------------------|------------------|
| 1 | `live_executor.js` `startAutomation()` (~L2795) | `automationEnabled=true` + `lastAutomationToggleAt/Reason` | No (`saveConfig` plain write, ~L1018) | `live_control_events.jsonl` `START` | Yes (toggle reason) |
| 2 | `live_executor.js` `stopAutomation()` (~L2803) | `automationEnabled=false` + toggle metadata | No | `live_control_events.jsonl` `STOP` | Yes |
| 3 | `live_executor.js` `emergencyStopControl()` (~L2813) | `automationEnabled=false`, `emergencyStop=true` | No | `live_control_events.jsonl` `EMERGENCY_STOP` + `KILL_SWITCH` live event | Yes |
| 4 | `dashboard_server.js` `POST /control/{start,stop,emergency}` (~L3193) | Calls #1–#3 | (via #1–#3) | (via #1–#3) | reason = fixed strings |
| 5 | `panic.ps1` | `emergencyStop=true`, `automationEnabled=false` | **Yes** (temp + validate + move) | `panic_events.jsonl` `PANIC` | fixed string |
| 6 | `reset_after_panic.ps1` | `emergencyStop=false`, `automationEnabled=true` (typed `YES`; refuses if `LIVE` or `dryRunMode=false`) | **Yes** | `panic_events.jsonl` `RESET` | fixed string |
| 7 | `reset_live_safety.js` | `emergencyStop=false`, `automationEnabled=false`, forces `dryRunMode=true` | No (plain write, ~L44) | **console only — no JSONL audit** | No |
| 8 | `emergency_stop.js` | sets `emergencyStop=true` | (safety util) | (control/console) | fixed |
| 9 | **Manual hand-edit** of `live_config.json` (any field) | **anything** — `positionSizeSol`, `thesis.*`, slippage, `executionMode`, `dryRunMode`, risk flags | n/a | **NOT audited at all** | **No** |
| — | `start_fomo.ps1` | **launcher** — validates `live_config.json` exists; **does not mutate config fields** | n/a | n/a | n/a |

### 1.1 Are config changes currently audited?

**Partially.** The **control plane** (automation/emergency toggles via executor, panic/reset via PowerShell) is logged to `live_control_events.jsonl` and `panic_events.jsonl`. But:

- **No field-level audit** of arbitrary edits (#9): a manual change to `positionSizeSol`, `thesis.scoreMin`, slippage caps, or even `executionMode`/`dryRunMode` by hand leaves **no record**.
- **No old→new diff** anywhere — events record the resulting action, not the prior value.
- **No unified actor/source/reason** schema across writers; reasons are fixed strings, not operator-supplied justifications.
- **`reset_live_safety.js` writes config but emits no JSONL audit** (#7).
- **`lastAutomationToggleAt/Reason`** in config captures only the *last* automation toggle, overwritten each time — not a history.

This is the gap A3 closes: a **single, field-level, append-only config change audit**.

> **Note:** Live submission arming flags (`FOMO_ENABLE_LIVE_SUBMISSION`, `FOMO_ALLOW_LOOP_LIVE`, `SOLANA_SIGNER_SECRET`) live in **`.env`**, not `live_config.json`. They are safety-critical but out of the config-file audit surface; A3 flags them as **requiring equivalent audit consideration** (env-change visibility), to be handled alongside this work — but A3 changes no `.env` and adds no env mutation.

---

## 2. Config field classification

Every field in `live_config.json` classified by safety relevance.

### 2.1 CRITICAL — execution authority & capital safety (reason + review required)

| Field | Why critical |
|-------|--------------|
| `executionMode` | `PIPELINE_DRY_RUN` ↔ `LIVE` — the master live/observe switch |
| `dryRunMode` | Gates whether transactions can be submitted |
| `emergencyStop` | Full halt; clearing it re-permits operation |
| `automationEnabled` | Gates new entries |
| `requireManualConfirm` | Human-in-the-loop gate |
| `walletPublicAddress` | Signing/target wallet identity (**redact in audit** — see §3.3) |
| `compoundingEnabled` | Hard-rejected risk behavior; enabling is dangerous |
| `averagingDownEnabled` | Hard-rejected risk behavior |
| `martingaleEnabled` | Hard-rejected risk behavior |

### 2.2 IMPORTANT — risk / strategy / economic parameters (reason required)

| Field | Group |
|-------|-------|
| `positionSizeSol`, `maxOpenTrades`, `startingCapitalUsd`, `minWalletBalanceSol` | Position/capital limits |
| `maxDailyLossSol`, `maxDailyLossCount`, `maxDrawdownPercent` | Loss limits |
| `maxEntrySlippagePct`, `maxExitSlippagePct`, `maxRoutePriceImpactPct` | Slippage/impact bounds |
| `priorityFeeMode`, `maxPriorityFeeLamports`, `fallbackPriorityFeeLamports`, `assumedComputeUnitLimit` | Fee budget |
| `confirmationCommitment`, `confirmationTimeoutMs`, `maxSubmitRetries` | Execution timing/retry |
| `thesis.scoreMin/Max`, `thesis.marketCapMin/Max`, `thesis.botDegenRateMax`, `thesis.top10HolderRateMin/Max`, `thesis.source` | Strategy thesis bounds |
| `strategyVersion`, `phase` | Strategy/phase identity |

### 2.3 INFORMATIONAL — metadata, non-execution (reason optional)

| Field | Note |
|-------|------|
| `lastAutomationToggleAt`, `lastAutomationToggleReason` | Toggle metadata (system-written) |
| `lastError` | Diagnostic |
| `phase1Notes` | Documentation string |

---

## 3. Required audit event schema — `config_change_audit.jsonl`

**Append-only JSONL, one event per changed field.** This is a **specification only** — the file is **not created** by A3, and no writer is added. Under M9/M10 it is **RUNTIME LOCAL** (gitignored, never committed).

### 3.1 Event fields

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `timestamp` | ISO-8601 UTC string | yes | When the change was applied |
| `actor` | string | yes | Who: operator id, `"dashboard"`, `"panic.ps1"`, `"reset_after_panic.ps1"`, `"reset_live_safety.js"`, `"manual_edit"`, `"system"` |
| `source` | string | yes | Origin path: e.g. `"live_executor.startAutomation"`, `"dashboard:/control/stop"`, `"panic.ps1"`, `"manual_edit"` |
| `field` | string (dot-path) | yes | e.g. `"executionMode"`, `"thesis.scoreMin"` |
| `oldValue` | any (JSON) | yes | Prior value (`null` if newly added) |
| `newValue` | any (JSON) | yes | New value |
| `reason` | string | **required for CRITICAL & IMPORTANT** | Operator justification |
| `riskLevel` | enum `CRITICAL` / `IMPORTANT` / `INFORMATIONAL` | yes | From §2 |
| `requiresReview` | bool | yes | True for CRITICAL (and IMPORTANT per policy) |
| `modeAtChange` | string | yes | `executionMode` at time of change |
| `liveArmedAtChange` | bool | yes | `computeLiveArmedStatus()` result at change time |

### 3.2 Recommended additional fields (future-friendly, optional)

| Field | Purpose |
|-------|---------|
| `changeId` | Correlate multi-field edits from one operator action |
| `dryRunModeAtChange`, `emergencyStopAtChange` | Posture snapshot for forensics |
| `prevHash` / `eventHash` | Tamper-evidence chain (future; do not build now) |

### 3.3 Schema rules

- **Append-only.** Never rewrite or truncate (consistent with the append-only audit philosophy in [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) do-not-touch list).
- **Secret-safe.** `walletPublicAddress` is recorded **redacted/partial** (e.g. first/last 4 chars); never log `.env` secrets.
- **One event per field.** A multi-field edit emits multiple events sharing a `changeId`.
- **Reason mandatory for CRITICAL/IMPORTANT.** A change without a reason is itself an audit finding (recorded with `reason: null`, `requiresReview: true`), never silently dropped.

### 3.4 Example events (illustrative only — not written by A3)

```jsonl
{"timestamp":"2026-06-22T21:05:00Z","actor":"operator:nalle","source":"dashboard:/control/stop","field":"automationEnabled","oldValue":true,"newValue":false,"reason":"pausing entries to inspect reconciliation","riskLevel":"CRITICAL","requiresReview":true,"modeAtChange":"PIPELINE_DRY_RUN","liveArmedAtChange":false}
{"timestamp":"2026-06-22T21:12:30Z","actor":"manual_edit","source":"manual_edit","field":"thesis.scoreMin","oldValue":80,"newValue":78,"reason":null,"riskLevel":"IMPORTANT","requiresReview":true,"modeAtChange":"PIPELINE_DRY_RUN","liveArmedAtChange":false}
```

---

## 4. What requires explicit reason vs what stays human-only

### 4.1 Requires explicit operator reason

- **All CRITICAL fields** (§2.1) — reason + `requiresReview: true`.
- **All IMPORTANT fields** (§2.2) — reason required.
- INFORMATIONAL — reason optional.

### 4.2 Must remain manual / human-only (never auto-mutated)

These may **never** be changed by automation, A3 tooling, or any future audit mechanism — they are operator-only and gated:

- `executionMode` → `LIVE`
- `dryRunMode` → `false`
- `emergencyStop` clearing (already human-gated: `reset_after_panic.ps1` typed `YES`; `reset_live_safety.js`)
- `walletPublicAddress`
- `compoundingEnabled` / `averagingDownEnabled` / `martingaleEnabled` → `true`

A3's job is to **record** such a change (and that it needs review) — **not** to perform it, approve it, or block it.

---

## 5. Principles

1. **Audit, don't enforce.** A3 records changes; gates/A6 enforce; A1 makes writes safe. Keep these separate.
2. **Reason is part of the change.** A safety-relevant config change without a recorded justification is incomplete and flagged for review.
3. **Old and new, always.** Every event captures `oldValue` and `newValue`; "what it became" without "what it was" is not an audit.
4. **Posture at change time.** `modeAtChange` + `liveArmedAtChange` make each change interpretable after the fact.
5. **Human-only stays human-only.** A3 never introduces automatic mutation of CRITICAL fields.
6. **Append-only + secret-safe.** Never rewrite history; never log secrets; redact wallet identity.
7. **Repo wins / stability over convenience.** When unsure, record more and change nothing.

---

## 6. Risks

| Risk | Likelihood | Impact | Mitigation framing |
|------|-----------|--------|--------------------|
| A3 misread as "build the audit writer now" | Medium | Medium | §0 + §9: requirements only; file not created |
| Audit mechanism tempted to auto-correct config | Low | High | §4.2 + principle 5: never auto-mutate; record only |
| Secret/wallet leakage into audit log | Low | High | §3.3 redaction rule |
| Manual edits remain invisible even after A3 | Medium | Medium | Requirement names manual_edit capture (load-time diff) as a future phase |
| Schema churn once implemented | Medium | Low | Optional fields isolated (§3.2); required core frozen |
| Confusing A3 (audit) with A1 (atomic writes) | Medium | Medium | Separation table; `saveConfig` non-atomicity noted as A1, not A3 |
| Scope creep into enforcement/blocking | Medium | High | §9 forbiddens; audit ≠ gate |
| Treating dedicated reason capture as authorization | Low | High | Reason ≠ approval; humans authorize via existing records |

---

## 7. Acceptance criteria

A3 is complete when **all** hold:

1. **AC1 — Write surface mapped.** Every active config writer and the manual-edit path are enumerated with current audit coverage. ✅ (§1)
2. **AC2 — Audit gap stated.** Where config changes are/aren't audited today is explicit. ✅ (§1.1)
3. **AC3 — Fields classified.** Every `live_config.json` field is CRITICAL / IMPORTANT / INFORMATIONAL. ✅ (§2)
4. **AC4 — Schema defined.** `config_change_audit.jsonl` event schema with all required fields (timestamp, actor, source, field, oldValue, newValue, reason, riskLevel, requiresReview, modeAtChange, liveArmedAtChange). ✅ (§3)
5. **AC5 — Reason & human-only rules.** What requires a reason and what stays human-only is defined. ✅ (§4)
6. **AC6 — No filesystem/runtime change.** `git status` shows **only this new doc**; `config_change_audit.jsonl` does **not** exist; posture unchanged. **Verify (§8).**
7. **AC7 — Separation preserved.** M5/A3/A4/A1/A2 kept distinct; no enforcement, no auto-mutation, no live enablement. ✅ (§0)

---

## 8. Verification & negative verification

A3 is planning-only; verification proves nothing was built.

```powershell
# Planning-only footprint:
git status --short                         # expect only docs/A3_CONFIG_CHANGE_AUDIT_PLAN.md
git diff --stat

# The audit file must NOT be created by A3:
Test-Path .\config_change_audit.jsonl      # expect False

# Config and safety code untouched:
git diff -- live_config.json live_executor.js dashboard_server.js reset_live_safety.js panic.ps1 reset_after_panic.ps1 start_fomo.ps1   # expect empty

# Posture unchanged:
node live_executor.js --status             # expect PIPELINE_DRY_RUN, dryRunMode true, liveArmed false
node run_safety_tests.js                    # expect 4/4 passed
```

Pass = only `docs/A3_CONFIG_CHANGE_AUDIT_PLAN.md` is new; no `config_change_audit.jsonl`; config/safety diffs empty; posture `PIPELINE_DRY_RUN` / `liveArmed: false`; safety 4/4.

---

## 9. "Do NOT implement during A3 planning" warnings

Hard prohibitions for this milestone:

- ❌ **Do not change `live_config.json`** (no field, no value, not even formatting).
- ❌ **Do not create `config_change_audit.jsonl`** or any writer for it.
- ❌ **Do not enable `LIVE`** or alter `executionMode` / `dryRunMode` / arming gates.
- ❌ **Do not modify safety gates** (`readinessChecks`, `safetyCheck`, `liveSubmission`, emergency/reset logic).
- ❌ **Do not add automatic config mutation** of any kind.
- ❌ **Do not make `saveConfig` atomic / add locks** (that is A1).
- ❌ **Do not introduce a database, index, or dependency.**
- ❌ **Do not change strategy values** (`thesis.*`, slippage, sizes, limits).
- ❌ **Do not edit `.env`** or add env mutation.
- ✅ **Allowed:** authoring this requirements doc; running read-only status/test commands.

If applying A3 ever requires editing config, code, or creating the audit file, **stop — that is implementation, not A3 planning.**

---

## 10. Future implementation phases (for later, not now)

A non-binding sketch so reviewers see the runway — **none built in A3**:

1. **Phase 1 — Instrument known writers.** Have `startAutomation` / `stopAutomation` / `emergencyStopControl` / panic / reset emit `config_change_audit.jsonl` events (old→new, reason, posture) **in addition to** existing control logs.
2. **Phase 2 — Manual-edit detection.** On config load, diff against a last-known snapshot and emit `actor: manual_edit` events for drift (no auto-correction).
3. **Phase 3 — Dashboard surfacing.** Read-only panel showing recent config changes + unreviewed CRITICAL/IMPORTANT changes (visibility, like M6a/M7/M8).
4. **Phase 4 — Optional auth token** for control routes (STABILIZATION A3 "optional auth"), still human-authorized.
5. **A1 convergence.** Atomic single-writer config + audit emitted in the same locked write.

Each phase is a separate, explicitly-authorized change with its own safety-test run.

---

## 11. One-line A3 mandate

**Specify how every safety-relevant `live_config.json` change is recorded — actor, source, field, old→new, reason, risk level, and posture — and which changes stay human-only, while creating no audit file, mutating no config, enforcing nothing, and enabling no live trading.**

---

*Sprint 3 · A3 Config Change Audit Requirements (planning only) · TracktaOS Module 1 · Phase 1 Stabilization · Safe default: `PIPELINE_DRY_RUN`, no live submission. Stability over convenience. Source snapshot dated 2026-06-22.*
