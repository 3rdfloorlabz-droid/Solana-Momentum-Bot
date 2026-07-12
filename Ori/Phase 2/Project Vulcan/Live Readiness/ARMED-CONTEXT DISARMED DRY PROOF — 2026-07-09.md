# Armed-Context Disarmed Dry Proof — 2026-07-09

Status:
**DRY PROOF PASS — PRODUCTION DISARMED UNCHANGED — NO ARMED PROOF**

Gate type:
Disarmed coexistence proof — Domain A dry readiness + Domain B wrong-context fail-closed

Prerequisites:
`ARMED-CONTEXT PREFLIGHT REGRESSION TEST GATE — 2026-07-08.md` · `analysis/armed_preflight_regression_receipt.json` · `ARMED-CONTEXT PREFLIGHT IMPLEMENTATION GATE — 2026-07-08.md` · `Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md`

Proof date:
**2026-07-09**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Production code changed:** **No** · **Config changed:** **No** · **`.env` changed:** **No** · **Armed proof:** **No** · **Submit/broadcast:** **No**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **DRY PROOF PASS**
>
> **ARMED NO-SUBMIT PROOF NOT PERFORMED**

---

## 2. Baseline

| Field | Value |
|-------|-------|
| **UTC timestamp** | `2026-07-09T17:14:12.158Z` |
| **Local timestamp** | `2026-07-09 11:14:12 -06:00` |
| **Posture** | `PIPELINE_OBSERVING` |
| **`liveArmed`** | `false` |
| **`executionMode`** | `PIPELINE_DRY_RUN` |
| **`dryRunMode`** | `true` |
| **`FOMO_ENABLE_LIVE_SUBMISSION`** | unset |
| **`FOMO_ALLOW_LOOP_LIVE`** | unset |
| **Runtime stub** | absent |
| **Executor loops** | 0 |
| **`live_config.json` SHA-256** | `0996882e1a5244d05079a2a6f3ff09049758ecbbf3b8e3e0434ee4b13a4d33ef` |
| **Position/reconciliation/recovery/capital** | none |

---

## 3. Files inspected

| File | Purpose |
|------|---------|
| `ARMED-CONTEXT PREFLIGHT REGRESSION TEST GATE — 2026-07-08.md` | Prior gate receipt |
| `analysis/armed_preflight_regression_receipt.json` | Machine-readable regression proof |
| `ARMED-CONTEXT PREFLIGHT IMPLEMENTATION GATE — 2026-07-08.md` | Implementation baseline |
| `Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md` | Domain model · Option B |
| `validate_live_system.js` | Domain A validator |
| `run_safety_tests.js` | Domain A safety suite |
| `test_n6_estop_drill.js` | Domain A N6 dry drill |
| `validate_armed_preflight.js` | Domain B validator |
| `run_armed_preflight_manifest.js` | Domain B manifest runner |
| `test_n6_armed_estop_probe.js` | Domain B armed-safe N6 |
| `live_validation_common.js` | Shared validation helpers |
| `docs/ARMED_PREFLIGHT.md` | Command documentation |
| `package.json` | npm scripts |

---

## 4. Domain A dry validation

| Command | Result |
|---------|--------|
| `node validate_live_system.js` | **PASS** — exit 0, 0 failures, 5 warnings |
| `node run_safety_tests.js` | **PASS** — exit 0, **85/85** |
| N6 dry drill (`test_n6_estop_drill.js`) | **PASS** — `N6 E-STOP DRILL TEST PASSED` |

Existing dry output and exit codes remain compatible. No live-only requirement leaks into Domain A.

---

## 5. Domain B wrong-context proofs (production dry posture)

| Command | Exit | Overall status | Mutation |
|---------|------|----------------|----------|
| `node validate_armed_preflight.js --json` | **2** | `WRONG_POSTURE` | none |
| `node run_armed_preflight_manifest.js` | **2** | `WRONG_POSTURE` | none |
| `node test_n6_armed_estop_probe.js` | **1** | fail-closed — `production posture not LIVE_ARMED` | none |

Manifest runner did **not** produce AP-01 through AP-20 overall PASS. No skipped-as-PASS behavior.

---

## 6. Command separation

| Domain | Commands | Verified |
|--------|----------|----------|
| **A — Disarmed Readiness** | `validate_live_system.js` · `run_safety_tests.js` | **Yes** |
| **B — Armed-Context Preflight** | `validate_armed_preflight.js` · `run_armed_preflight_manifest.js` | **Yes** |
| **C — Post-Disarm Closure** | Same as Domain A | **Yes** |

No CLI `--context` or waiver switch bypasses posture checks. `forceChecks` is programmatic/test-only and not exposed on production CLI entrypoints.

---

## 7. Evidence artifacts (secret-free)

| Artifact | Path |
|----------|------|
| Dry validator output | `analysis/dry_proof_validate_live_system.out.txt` |
| Safety suite output | `analysis/dry_proof_safety_tests.out.txt` |
| Armed validator receipt | `analysis/dry_proof_armed_validator_receipt.json` |
| Armed manifest receipt | `analysis/dry_proof_armed_manifest_receipt.json` |
| N6 armed probe output | `analysis/dry_proof_n6_armed_probe.out.txt` |
| Dry proof receipt | `analysis/armed_preflight_dry_proof_receipt.json` |

Receipts contain boolean gate status and fingerprints only — no secret-bearing values.

---

## 8. Post-proof production state

| Field | Value |
|-------|-------|
| **`live_config.json` SHA-256** | `0996882e1a5244d05079a2a6f3ff09049758ecbbf3b8e3e0434ee4b13a4d33ef` *(unchanged)* |
| **Configuration/environment** | unchanged |
| **Runtime stub** | absent |
| **`liveArmed`** | `false` |
| **Posture** | `PIPELINE_OBSERVING` |
| **Executor loops** | 0 |
| **Submit/broadcast/signatures** | none |
| **Position/reconciliation/recovery/capital** | none |

---

## 9. Required output summary

| Item | Value |
|------|-------|
| **Dry-proof receipt path** | `ARMED-CONTEXT DISARMED DRY PROOF — 2026-07-09.md` |
| **Machine-readable receipt path** | `analysis/armed_preflight_dry_proof_receipt.json` |
| **Baseline timestamp** | `2026-07-09T17:14:12.158Z` / `2026-07-09 11:14:12 -06:00` |
| **Baseline posture** | `PIPELINE_OBSERVING` |
| **Baseline live_config hash** | `0996882e1a5244d05079a2a6f3ff09049758ecbbf3b8e3e0434ee4b13a4d33ef` |
| **Domain A validator result** | **PASS** |
| **Domain A safety-suite result** | **PASS — 85/85** |
| **N6 dry drill result** | **PASS** |
| **Existing dry output/exit compatibility preserved** | **Yes** |
| **Armed validator wrong-context exit code** | **2** |
| **Armed validator wrong-context receipt** | **WRONG_POSTURE** |
| **Armed manifest dry-posture fail-closed result** | **PASS** — exit 2, no AP overall PASS |
| **Armed-safe N6 wrong-posture result** | **PASS** — exit 1, fail-closed |
| **Domain command separation verified** | **Yes** |
| **Generic waiver/context bypass present** | **No** |
| **Secret leakage detected** | **No** |
| **Post-proof live_config hash** | `0996882e…` *(unchanged)* |
| **Configuration/environment changed** | **No** |
| **Runtime stub created** | **No** |
| **System remains disarmed** | **Yes** |
| **Executor loops started** | **No** |
| **Submit/broadcast invoked** | **No** |
| **Transaction signatures** | **none** |
| **Position/reconciliation/recovery/capital** | **none** |
| **Dry proof status** | **PASS** |
| **OR-20260630-008 status** | **not_promoted** |
| **Readiness/profitability claims** | **No** |

---

## 10. Explicit non-executions (this gate)

| Item | Status |
|------|--------|
| Production re-arming | **No** |
| Runtime stub / R15 authorization | **No** |
| Armed no-submit production proof | **Not performed** |
| OR promotion / readiness claims | **No** |

---

## 11. Recommended next gate

**Armed-Context Armed No-Submit Proof Planning**

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/ARMED-CONTEXT DISARMED DRY PROOF — 2026-07-09.md`
