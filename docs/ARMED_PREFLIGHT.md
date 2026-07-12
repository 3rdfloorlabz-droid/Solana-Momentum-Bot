# Armed-Context Preflight Tooling

Secret-free operator reference for Domain B armed-context execution preflight.

**This tooling does not authorize execution, re-arming, or live submission.**

## Validation domains

| Domain | When | Commands |
|--------|------|----------|
| **A — Disarmed Readiness** | Before arming | `node validate_live_system.js` · `node run_safety_tests.js` |
| **B — Armed-Context Execution Preflight** | After arming, before quotes/confirmation | `node validate_armed_preflight.js` · `node run_armed_preflight_manifest.js` |
| **C — Post-Disarm Closure** | After C1–C3 rollback + stub removal | Same as Domain A |

## Domain B commands

```bash
node validate_armed_preflight.js --json
node validate_armed_preflight.js --out analysis/armed_preflight_receipt.json
node run_armed_preflight_manifest.js --out analysis/armed_preflight_manifest_receipt.json
npm run validate:armed-preflight
npm run test:armed-preflight-unit
npm run test:armed-preflight-regression
npm run test:armed-preflight-prerequisites
npm run test:armed-estop-probe
```

### Armed no-submit proof context (session-scoped)

When running against a future proof session, supply explicit linkage — **no defaults, no EV02 fallback**:

```bash
node validate_armed_preflight.js --json \
  --session-id RB-G9-YYYYMMDD-AP01 \
  --arming-baseline-hash <sha256-at-C3> \
  --auth-g1 <path> --auth-g2 <path> --auth-g3 <path> --auth-g4 <path>
```

Or one explicit session manifest:

```bash
node validate_armed_preflight.js --json \
  --session-id RB-G9-YYYYMMDD-AP01 \
  --arming-baseline-hash <sha256-at-C3> \
  --session-manifest path/to/session_manifest.json
```

G4 must be **Armed No-Submit Proof Authorization** — Micro-Live Execution Authorization cannot satisfy G4. AP-15 returns `NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE` with reason `armed-no-submit-proof-scope` in proof context.

### R15 dual-purpose schema (schemaVersion 2)

Shared validator: `r15_approval_validator.js` · loader API: `loadR15ApprovalRecord({ expectedPurpose, expectedSessionId, expectedWallet, now, allowLegacyMicroLive })`.

| Context | `expectedPurpose` | Call site |
|---------|-------------------|-----------|
| Micro-live BUY/submit guard | `micro_live_execution` | `live_executor.js` `assertMicroLiveApprovalRecord` |
| Armed no-submit proof AP-13 | `armed_no_submit_proof_only` | `armed_preflight_checks.js` proof path |

Legacy records (schemaVersion absent/`1`) are accepted **only** in micro-live context with `allowLegacyMicroLive: true`. Armed-proof context always rejects legacy. One purpose never clears the other guard.

Examples: `examples/r15_manual_approval_record_v2_micro_live.example.json` · `examples/r15_manual_approval_record_v2_armed_proof.example.json` *(non-canonical)*.

## Exit codes (`validate_armed_preflight.js`)

| Code | Meaning |
|------|---------|
| **0** | All mandatory AP checks PASS |
| **1** | One or more checks FAIL |
| **2** | Wrong posture — not LIVE_ARMED |

## Wrong-posture behavior

If production is disarmed (`PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false`), Domain B tools **refuse** with exit **2**. This is correct fail-closed behavior.

## No-submit guarantee

Armed preflight tools:

- do not call `submitSwap`, `sendTransaction`, or `sendRawTransaction`
- do not sign transactions
- do not broadcast
- do not mutate `live_config.json` or `.env`
- do not create runtime R15 stubs or positions

## N6 distinction

| Tool | Domain | Production posture |
|------|--------|-------------------|
| `test_n6_estop_drill.js` | A / C | Requires **dry** production (`PIPELINE_DRY_RUN`, `dryRunMode: true`) |
| `test_n6_armed_estop_probe.js` | B | Requires **LIVE_ARMED** production |

The armed-safe N6 probe **does not replace** the full dry N6 drill.

## Manifest AP-01 through AP-20

Governed checks are defined in `armed_preflight_manifest.js`. Each check returns:

- `PASS`
- `FAIL`
- `NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE`

`SKIP` is forbidden. Skipped checks must never be reported as PASS.

## Architecture references

- Decision: `Ori/Phase 2/Project Vulcan/Live Readiness/Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md`
- Authorization: `Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Armed-Context Preflight Implementation — 2026-07-08.md`
- Continuum planning: `Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 Armed Continuum Remediation Implementation Planning — 2026-07-11.md`

## Armed Continuum Gate (testing-only — AP04 not authorized)

The Single Armed Continuum Gate is a **one-shot** orchestrator for future authorized proof sessions. **It is not authorized for live production execution in the current gate.**

| Item | Value |
|------|-------|
| Entry | `npm run run:armed-continuum` |
| Module | `run_armed_continuum.js` |
| Production default | **Fail-closed** without `--dry-rehearsal` and without explicit session continuum authorization artifact |
| AP04 | **Not authorized** |

### Continuum flow (automatic — no chat handoff)

`PRECHECK` → `ARMING` → `STUB` → `AP` → `N6` → `ROLLBACK` → `DOMAIN_C` → `FINALIZE`

Process isolation and Domain A remain **outside** the continuum (pre-continuum gates).

### Proof-day G1 rule

- G1 signed only on proof day (IANA timezone, default `America/Denver`)
- Expiry ≥ operating-block end + **60 minutes**
- Mechanical reject: proof day not reached · expiry short · timezone mismatch · stale · reused
- Validator: `armed_g1_proof_day.js` (also exposed via `armed_preflight_session.validateProofDayG1ForSession`)

### Timing thresholds (monotonic enforcement)

| Constant | Value |
|----------|-------|
| Armed cap | 15 minutes |
| Min remaining after stub | 12 minutes |
| Min remaining at AP | 10 minutes |
| Min remaining at N6 | 8 minutes |
| Domain C reserve | 3 minutes |
| Max stub→AP delay | 2 minutes (30s SLO) |
| Max AP→N6 delay | 15 seconds |
| Max rollback initiation delay | 5 seconds |

**Enforcement (corrected 2026-07-11):**

- Rollback initiation delay measured from terminal AP/N6 event to rollback start; **>5s** records `ROLLBACK_INITIATION_DELAY_EXCEEDED` and prohibits PASS; rollback still executes.
- Domain C reserve checked before entry; **<3m remaining** records `DOMAIN_C_RESERVE_VIOLATION` and prohibits PASS; Domain C still executes.
- All runtime transitions validated via `assertLegalTransition` in `armed_continuum_state.js`.
- `detectMonotonicAnomaly` invoked at critical checkpoints; anomaly forces fail-closed (rollback if C1 mutated).
- **F4 production AP/N6 wiring implemented** (`f4_ap_adapter.js` / `f4_n6_adapter.js`, wired via `deps.runApManifest` / `deps.runN6Probe` with `deferAp17ToContinuum` enforced — see `RB-G9 F4 Adapter Implementation and Pre-Production-Integration Follow-Up Disposition — 2026-07-11.md`). **AP04 is still not authorized** — the separate RB-G9 Armed Continuum Production Integration Authorization gate has not been sought, independent of adapter code existing.

### Receipt policy

**While armed:** JSON machine receipt + append-only JSONL event log only — no narrative Markdown.

**After disarm:** narrative Markdown may be generated from machine evidence (future operational gate only).

### Rollback ownership

Orchestrator owns rollback after any successful C1 mutation. D1/D2/D3 + stub removal in guaranteed cleanup path. Domain C + safety suite after rollback. Process restoration excluded from continuum implementation.

### AP / N6 integration

- AP manifest invoked **once**; AP-17 deferred when `deferAp17ToContinuum` is set on adapters
- Armed-safe N6 probe invoked **once** in continuum `N6` state
- No retry inside the same armed window

### Continuum exit codes

| Code | Class |
|------|-------|
| 0 | PASS |
| 10–13 | Precheck / auth / Domain A / isolation |
| 14 | Duplicate continuum invocation |
| 20–25 | Arming / stub / timing / AP / N6 |
| 26 | Timing enforcement violation (rollback delay / Domain C reserve) |
| 27 | Monotonic timer anomaly |
| 30–32 | Rollback / Domain C / safety |
| 40 | Receipt write failed |
| 50 | Unexpected state |

### No-submit boundary

Continuum must not `require()` signer, Jupiter quote client, scanner, transaction proof harness, or submit/broadcast paths. Static check: `verifyNoSubmitImportBoundary()` in `run_armed_continuum.js`.

### Continuum test commands

```bash
npm run test:armed-continuum-timing
npm run test:armed-g1-proof-day
npm run test:armed-continuum-events
npm run test:armed-continuum-rollback
npm run test:armed-continuum-integration
```

All continuum tests run in **simulation/mock mode only** — no production arming, no live AP/N6, no capital exposure.
