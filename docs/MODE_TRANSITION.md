# Mode Transition Runbook

**Purpose:** Explain what `live_executor.js` does in each execution mode, what changes when you flip modes, and the checks required before any transition.  
**Audience:** Operators and reviewers (Ori, engineering, future TracktaOS packaging).  
**Canonical executor:** root `live_executor.js` only — not archive folder copies.

---

## Sprint 1 — do not flip modes

> **Do not change `executionMode` away from `PIPELINE_DRY_RUN` during Sprint 1 stabilization** unless you are executing the full LIVE authorization path with explicit written approval.
>
> Sprint 1 success criteria expect `node live_executor.js --status` to show `executionMode: PIPELINE_DRY_RUN` and `dryRunMode: true` on the shared environment. Mode experiments belong on isolated branches or machines, not on the stabilization track.

Normal migration posture:

- `executionMode: "PIPELINE_DRY_RUN"`
- `dryRunMode: true`
- No `FOMO_ENABLE_LIVE_SUBMISSION=YES`
- No `SOLANA_SIGNER_SECRET` loaded for routine observation

---

## How mode is chosen

Primary control: **`live_config.json` → `executionMode`**

Allowed values: `PIPELINE_DRY_RUN`, `DRY_RUN`, `LIVE`.

If `executionMode` is missing or invalid, the executor falls back to legacy rules: `dryRunMode: false` implies `LIVE`, otherwise `DRY_RUN`. **Always set `executionMode` explicitly** — do not rely on the fallback.

Verify current mode:

```powershell
node live_executor.js --status
```

---

## Mode matrix

What the executor does **each automation cycle** (`runCycle`) when `emergencyStop` is false:

| | **`PIPELINE_DRY_RUN`** (Phase 1 default) | **`DRY_RUN`** (legacy) | **`LIVE`** |
|---|------------------------------------------|------------------------|------------|
| **Purpose** | Observe the real Jupiter quote → route → build → simulate path without moving funds | Legacy synthetic entry path (no full pipeline) | Real on-chain execution |
| **`manageOpenPositions`** | **Not called** | Called every cycle | Called every cycle |
| **Open live exits** (target / stop / timeout on `live_positions.json`) | **No** | Yes (dry-run entries if any) | Yes (real) |
| **Entry path when automation on** | `observePipelineCandidate` — audit-only observation | `enterPosition` → synthetic `submitSwap` | `enterPosition` → full pipeline + sign/submit when armed |
| **Signing / submission** | Never | Never | Only when [LIVE authorization](../LIVE_AUTHORIZATION_RECORD.md) gates pass |
| **Candidate selection** | Pipeline queue + broad observation pool (`pipeline_candidates.jsonl`, open paper) | Strict Phase 1 thesis from open paper only | Strict Phase 1 thesis from open paper only |
| **Typical `dryRunMode`** | `true` | `true` | must be `false` |
| **Writes to `live_positions.json`** | No new live positions from observation | Can create dry-run position records | Creates real open positions |
| **Primary audit output** | `execution_audit.jsonl` (`PIPELINE_DRY_RUN` stages) | `live_trades.jsonl` events | `live_trades.jsonl` + on-chain outcomes |

### Critical: `PIPELINE_DRY_RUN` and `manageOpenPositions`

In **`PIPELINE_DRY_RUN`**, the executor **does not call `manageOpenPositions`**. That is intentional:

- Open rows in **`live_positions.json` are not polled** for target, stop, or timeout exits while you remain in pipeline mode.
- Pipeline mode **observes** candidates through the unsigned swap pipeline; it does **not** manage live position lifecycle.
- **`monitor.js`** continues to manage **paper** trades in `paper_trades.json` — that is separate from live position management.

If you flip to `DRY_RUN` or `LIVE` without understanding this, **`manageOpenPositions` starts running** on the next cycle. Any open live positions become subject to exit logic. Plan transitions explicitly.

### What `PIPELINE_DRY_RUN` does **not** do

- Does not sign or submit transactions
- Does not load a real signer secret for submission
- Does not call `manageOpenPositions` (no live exit management)
- Does not replace paper monitoring — run `monitor.js` for paper PnL
- Does not mean “paper trading” — paper ledger is scanner + monitor; pipeline mode is **execution observation**

### What changes in `DRY_RUN` vs `LIVE`

| | **`DRY_RUN`** | **`LIVE`** |
|---|---------------|------------|
| **`submitSwap`** | Returns a synthetic intent object; no Jupiter pipeline | Full pipeline; may sign and submit when gates pass |
| **Capital at risk** | None | Real SOL and tokens |
| **Env gates** | Signer not required for normal operation | Requires `SOLANA_SIGNER_SECRET`, `FOMO_ENABLE_LIVE_SUBMISSION=YES`, dedicated RPC, and more — see [LIVE_AUTHORIZATION_RECORD.md](../LIVE_AUTHORIZATION_RECORD.md) |
| **First-live size cap** | N/A | Code enforces `positionSizeSol ≤ 0.01` at submission even though config allows up to `0.10` for Phase 1 dry-run |

---

## Transition overview

| From → To | When considered | Main behavioral change |
|-----------|-----------------|------------------------|
| **Stay on `PIPELINE_DRY_RUN`** | Sprint 1 default | Accumulate pipeline observations in `execution_audit.jsonl` |
| **`PIPELINE_DRY_RUN` → `DRY_RUN`** | Rare in Phase 1 | **`manageOpenPositions` begins**; entries use legacy synthetic path |
| **`PIPELINE_DRY_RUN` → `LIVE`** | Only after formal authorization | **`manageOpenPositions` begins**; real sign/submit path; capital at risk |

### Wind-down before leaving `PIPELINE_DRY_RUN`

Complete before editing `executionMode` or arming live env vars:

1. **Stop automation** — set `automationEnabled: false` or use dashboard STOP (exits in other modes may still run until mode changes; in pipeline mode there are no live exit cycles anyway).
2. **Review logs** — `execution_audit.jsonl`, `live_errors.jsonl`, `live_control_events.jsonl`.
3. **Inspect `live_positions.json`** — expect empty during pure pipeline observation; if not empty, understand why before enabling live management.
4. **Clear reconciliation** — `pending_reconciliation.jsonl` must be empty or explicitly resolved per [RECONCILIATION_RUNBOOK.md](../RECONCILIATION_RUNBOOK.md).
5. **Run safety tests** — `npm test` (see [ACTIVE_MANIFEST.md](../ACTIVE_MANIFEST.md)).
6. **For `LIVE` only** — complete and sign [LIVE_AUTHORIZATION_RECORD.md](../LIVE_AUTHORIZATION_RECORD.md).

---

## Pre-flip checklist

Use before **any** change to `executionMode`, `dryRunMode`, or live arming env vars.

### All mode changes

- [ ] Read this runbook and confirm why the transition is needed
- [ ] `node live_executor.js --status` captured (before state)
- [ ] Automation stopped unless you deliberately test a controlled cycle
- [ ] `npm test` passes locally (or CI green on the merging branch)
- [ ] `emergencyStop` is false, or cleared via `node reset_live_safety.js` with eyes open
- [ ] Operator understands whether **`manageOpenPositions` will start** after the flip

### Additional checks for `LIVE` only

Complete [LIVE_AUTHORIZATION_RECORD.md](../LIVE_AUTHORIZATION_RECORD.md) in full. Minimum technical gates include:

- [ ] Written authorization signed
- [ ] `executionMode: LIVE` and `dryRunMode: false` set deliberately (not accidental)
- [ ] `automationEnabled: true` only when ready for a controlled test
- [ ] `SOLANA_SIGNER_SECRET` present only for the authorized run
- [ ] `FOMO_ENABLE_LIVE_SUBMISSION=YES`
- [ ] Dedicated RPC configured (not public mainnet-beta fallback)
- [ ] `positionSizeSol ≤ 0.01` for first-live submission gate
- [ ] `pending_reconciliation.jsonl` empty
- [ ] Operator has read [RECONCILIATION_RUNBOOK.md](../RECONCILIATION_RUNBOOK.md) and panic procedure
- [ ] No retry while transaction status is unknown

Do **not** treat this checklist as a substitute for the authorization record — it summarizes executor expectations; the record is the approval artifact.

---

## Commands and files

| Action | Command / file |
|--------|----------------|
| Check mode | `node live_executor.js --status` |
| Safety test suite | `npm test` |
| Safety reset (does not re-enable automation) | `node reset_live_safety.js` |
| System validation | `node validate_live_system.js` |
| Pipeline / execution audit | `execution_audit.jsonl` |
| Live event ledger | `live_trades.jsonl` |
| Open live positions snapshot | `live_positions.json` |
| Control history | `live_control_events.jsonl` |

Avoid during migration unless explicitly approved:

```powershell
node live_executor.js --cycle
node live_executor.js --loop
```

See [OPERATIONS.md](./OPERATIONS.md) for daily procedures.

---

## Related documentation

| Document | Role |
|----------|------|
| [LIVE_AUTHORIZATION_RECORD.md](../LIVE_AUTHORIZATION_RECORD.md) | Required sign-off before LIVE |
| [RECONCILIATION_RUNBOOK.md](../RECONCILIATION_RUNBOOK.md) | Ambiguous on-chain outcomes |
| [OPERATIONS.md](./OPERATIONS.md) | Day-to-day ops and preflight |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System overview |
| [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) | Sprint 1 scope and pre-live gates |
| [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) | Known gaps including pipeline skip (documented here) |

---

*Last aligned with root `live_executor.js` behavior for Sprint 1 Q8. Strategy and thesis filters are unchanged — this document describes execution mode only.*
