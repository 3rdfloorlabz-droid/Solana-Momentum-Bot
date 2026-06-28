# Track A — Micro-Live Hard Guardrails

**Status:** BUILT — GUARDRAIL INFRASTRUCTURE ONLY (2026-06-23)  
**Live trading:** **NOT APPROVED**  
**R7 strategy edge:** **NOT ENOUGH DATA** — not bypassed  
**Purpose:** Engineering proof only — not strategy-profit validation

---

## Goal

Move Track A toward a tiny controlled micro-live **engineering proof** by building hard guardrails and operator caps. This phase validates infrastructure readiness; it does **not** enable live trading, arm the executor, or submit transactions.

Related planning:

- [R8A_MICRO_LIVE_ENGINEERING_PROOF_PLAN.md](./R8A_MICRO_LIVE_ENGINEERING_PROOF_PLAN.md)
- [FOMO_STRATEGIC_PIVOT_AND_ENGINE_ROADMAP.md](./FOMO_STRATEGIC_PIVOT_AND_ENGINE_ROADMAP.md) (Track A vs Track B)

---

## Current posture (must remain during prebuild)

| Setting | Required value |
|---------|----------------|
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| `liveArmed` | `false` |
| `recovery_actions.jsonl` | absent |
| Live trading approval | **NOT APPROVED** |

---

## Modules

| Module | Role |
|--------|------|
| `micro_live_caps.js` | Schema/loader for operator caps |
| `micro_live_guardrails.js` | Read-only guardrail checker |
| `test_micro_live_guardrails.js` | Temp-fixture regression tests |

**Output:** `analysis/micro_live_guardrails_check.json` (analysis/ only)

**Run:**

```bash
node micro_live_guardrails.js
node test_micro_live_guardrails.js
```

---

## Operator caps file

**Path:** `operator_records/micro_live_demo_caps.json`  
**Example template:** `examples/micro_live_demo_caps.example.json` (NOT authorization)

### Required fields

| Field | Requirement |
|-------|-------------|
| `approved` | `true` only for real operator approval |
| `approvedBy` | Non-empty string when approved |
| `approvedAt` | ISO timestamp when approved |
| `purpose` | Must be `"micro-live engineering proof only"` |
| `maxTradeSizeSol` | `<= 0.02` |
| `maxDailyLossSol` | `<= 0.05` |
| `maxTradesPerSession` | `=== 1` |
| `maxOpenLivePositions` | `=== 1` |
| `autoCompoundingAllowed` | `false` |
| `requireHumanPresent` | `true` |
| `stopAfterFirstTransaction` | `true` |
| `notes` | Operator notes string |

If the operator caps file is **missing**, guardrail verdict is **NOT_READY**.

Do **not** commit a real approved caps file unless explicitly authorized.

---

## Guardrail checks (read-only)

The checker verifies:

1. Operator caps file exists and passes conservative validation
2. `liveArmed === false`
3. `dryRunMode === true`
4. `executionMode === PIPELINE_DRY_RUN`
5. `recovery_actions.jsonl` absent
6. Safety suite green when reported (`run_safety_tests.js` available)
7. Singleton executor healthy; no duplicate executor loops
8. `wallet_status.json` present and usable
9. `live_positions.json` valid
10. Live session trade count is zero (before first proof)
11. Auto-compounding disabled
12. No emergency/panic unsafe state (`emergencyStop !== true`)

Future live submission code **must** pass this guardrail check before any transaction path.

---

## Guardrail verdicts

| Verdict | Meaning |
|---------|---------|
| `NOT_READY` | Blocked — missing/invalid caps, unsafe posture, recovery present, etc. |
| `READY_FOR_CAPS_APPROVAL` | Caps approved and conservative; secondary readiness gaps remain |
| `READY_FOR_FINAL_MICRO_LIVE_REVIEW` | All hard guardrails pass — engineering review only |

**Forbidden verdicts (never emitted):**

- `READY_FOR_LIVE_TRADING`
- `LIVE_APPROVED`

---

## Hard boundaries (this phase)

Do **not**:

- Enable live trading or set `executionMode` to `LIVE`
- Set `dryRunMode` false or `liveArmed` true
- Read or store private keys
- Submit transactions
- Modify strategy filters or loosen filters
- Auto-compound or allow multiple open live positions
- Add autonomous or executor recovery
- Create `recovery_actions.jsonl`
- Modify `live_positions.json`, `paper_positions.json`, `paper_trades.json`, or `observation_dedup.json`

---

## R7 context

R7 Strategy Performance Review remains **NOT ENOUGH DATA**. Track A micro-live is an **engineering proof** path chosen by the operator; it does **not** prove strategy edge or approve live trading.

---

## Recommended next steps

1. Operator creates and approves `operator_records/micro_live_demo_caps.json`
2. Run `node run_safety_tests.js` before any future arming
3. Resolve guardrail blockers reported in `analysis/micro_live_guardrails_check.json`
4. Continue R39+ signer path design before any submission wiring
