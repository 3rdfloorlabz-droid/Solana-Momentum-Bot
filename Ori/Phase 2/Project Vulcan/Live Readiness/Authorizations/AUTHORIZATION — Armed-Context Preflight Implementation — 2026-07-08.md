# AUTHORIZATION — Armed-Context Preflight Implementation — 2026-07-08

> **IMPLEMENTATION AUTHORIZATION ONLY**
>
> **NO CODE CREATED IN THIS GATE**
>
> **NO EXISTING TOOLING MODIFIED**
>
> **SYSTEM NOT RE-ARMED**
>
> **NO RUNTIME STUB · NO R15 SESSION · NO CAPITAL EXPOSURE**
>
> This record authorizes **one future governed implementation gate** to create the Option B armed-context preflight toolchain per the approved architecture decision. It **does not** implement code, alter existing validators or tests, re-arm the system, or authorize execution.

---

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | Armed-Context Preflight Implementation Authorization |
| **Record type** | Implementation Authorization · Governance-only |
| **Status** | **SIGNED — APPROVED — NOT IMPLEMENTED — NO CAPITAL EXPOSURE** |
| **Signer** | **Taylor Cheaney** |
| **Signature date** | **2026-07-08** |
| **Linked architecture decision** | [`../Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md`](../Decisions/DECISION%20%E2%80%94%20Armed-Context%20Preflight%20Architecture%20%E2%80%94%202026-07-08.md) |
| **Planning reference** | [`../ARMED-CONTEXT PREFLIGHT ARCHITECTURE PLANNING — 2026-07-08.md`](../ARMED-CONTEXT%20PREFLIGHT%20ARCHITECTURE%20PLANNING%20%E2%80%94%202026-07-08.md) |
| **Decision gate receipt** | [`../ARMED-CONTEXT PREFLIGHT ARCHITECTURE DECISION — 2026-07-08.md`](../ARMED-CONTEXT%20PREFLIGHT%20ARCHITECTURE%20DECISION%20%E2%80%94%202026-07-08.md) |
| **Originating incident** | **`RB-G9-20260707-EV02`** |
| **Originating classification** | **ABORTED_BEFORE_BROADCAST** |
| **Capital exposure (incident)** | **none** |
| **EV02 session reuse** | **Forbidden** |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |
| **Gate receipt** | [`../ARMED-CONTEXT PREFLIGHT IMPLEMENTATION AUTHORIZATION — 2026-07-08.md`](../ARMED-CONTEXT%20PREFLIGHT%20IMPLEMENTATION%20AUTHORIZATION%20%E2%80%94%202026-07-08.md) |
| **Safety baseline (disarmed)** | **85/85 PASS** · validator **PASS** |

---

## 1. What this signed record authorizes

Taylor authorizes **exactly one future gate**:

**Armed-Context Preflight Implementation Gate**

That gate may create the following **only** within the bounded scope below:

| Component | Purpose |
|-----------|---------|
| `validate_armed_preflight.js` | Domain B static/runtime armed-context validator |
| `run_armed_preflight_manifest.js` | Governed AP-01–AP-20 manifest runner |
| `test_n6_armed_estop_probe.js` | Domain B N6 armed-safe replacement probe |
| Shared posture-independent validation module | Narrowly scoped library (e.g. `live_validation_common.js`) |
| New regression tests | Architecture contract enforcement |
| Machine-readable receipts/fixtures | Deterministic JSON evidence artifacts |
| Package scripts | **Only** where required to invoke new tools |
| Documentation | **Only** where required to describe new commands |

**Invariant:** This sign-off ≠ implementation complete ≠ armed proof ≠ live session.

---

## 2. Authorized implementation scope (Implementation Gate only)

### 2.1 Files that may be created

- `validate_armed_preflight.js`
- `run_armed_preflight_manifest.js`
- `test_n6_armed_estop_probe.js`
- Shared posture-independent validation module *(narrow scope)*
- New test files for armed preflight regression coverage
- Fixture/receipt JSON schemas under `analysis/` or test temp dirs as appropriate
- Implementation gate receipt documentation

### 2.2 Files that may be updated (minimal)

- `package.json` scripts — invoke new tools only
- Operator/runbook documentation — describe Domain B commands only
- `ACTIVE_MANIFEST.md` — additive armed-preflight tooling entry only *(if required by implementation gate)*

### 2.3 Manifest AP-01 through AP-20 (required initial manifest)

| ID | Check |
|----|-------|
| **AP-01** | Production posture LIVE_ARMED |
| **AP-02** | Signed authorizations valid |
| **AP-03** | Runtime stub present · session-bound |
| **AP-04** | Executor loop count = 0 |
| **AP-05** | Singleton lock documented |
| **AP-06** | Open positions = 0 |
| **AP-07** | Pending reconciliation = 0 |
| **AP-08** | Recovery actions none/documented |
| **AP-09** | Capital exposure = none |
| **AP-10** | Signer present · wallet match *(no secret dump)* |
| **AP-11** | Dedicated RPC read-only OK |
| **AP-12** | Live submission gate failures all pass |
| **AP-13** | R15 approval record assert PASS |
| **AP-14** | BUY no-submit guard probe PASS |
| **AP-15** | Candidate packet bounds |
| **AP-16** | Jupiter quote/build read-only probe |
| **AP-17** | N6 armed-safe e-stop probe |
| **AP-18** | Config hash vs arming baseline |
| **AP-19** | OR-20260630-008 not_promoted |
| **AP-20** | R16 live path coupling (mocked) |

### 2.4 Manifest status contract (required)

Every check must return exactly one of:

- **PASS**
- **FAIL**
- **NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE**

Manifest runner must **fail** on: unknown check · missing check · duplicate check · missing evidence · invalid status · skipped-as-PASS · absent replacement evidence · wrong posture.

---

## 3. Explicit prohibitions (Implementation Gate must not)

| Prohibition |
|-------------|
| Change behavioral contract of `validate_live_system.js` |
| Change behavioral contract of `run_safety_tests.js` |
| Weaken `test_n6_estop_drill.js` |
| Convert dry failures into armed PASS |
| Add broad waiver flags |
| Add generic skip lists |
| Add safety-off environment variables |
| Report skipped checks as PASS |
| Invoke real submit / sign / broadcast paths |
| Mutate `live_config.json` or `.env` |
| Create runtime R15 stubs |
| Re-arm the system |
| Create positions / reconciliation / recovery / capital exposure |
| Start scanner or executor loops |
| Promote OR-20260630-008 |
| Claim readiness / edge / profitability |
| Reuse session `RB-G9-20260707-EV02` |
| Perform armed no-submit proof *(later gate)* |

---

## 4. Preservation requirements (Implementation Gate must)

| Requirement |
|-------------|
| Current dry validator behavior unchanged |
| Current 85/85 dry safety suite unchanged |
| Current N6 production-LIVE abort behavior unchanged |
| Fail-closed wrong-posture behavior |
| Armed validator exit **2** outside LIVE_ARMED |
| No-submit / no-sign / no-broadcast guarantees in all new tools |
| Full dry N6 remains authoritative for Domains A and C |
| AP-01 through AP-20 exactly as initial manifest |

---

## 5. N6 armed-safe probe requirements (Implementation Gate must)

Future `test_n6_armed_estop_probe.js` **must**:

| Requirement |
|-------------|
| Run only when production posture is LIVE_ARMED |
| Inspect production e-stop state read-only |
| Use isolated temporary no-submit harness (`TRACKTA_RUNTIME_ROOT`) |
| Prove halt gate precedence |
| Prove new entry blocked after halt assertion in harness |
| Leave production `live_config.json` hash unchanged |
| Perform no submit · sign · broadcast · position · reconciliation |
| Fail closed on ambiguity |
| Never replace full dry N6 for Domains A or C |

---

## 6. Machine-readable output requirements (Implementation Gate must)

All new validators/runners must emit JSON including:

| Field |
|-------|
| `schemaVersion` |
| `toolName` |
| `context` |
| `startedAt` |
| `completedAt` |
| `overallStatus` |
| `posture` |
| `fingerprints` |
| `checks` |
| `evidence` |
| `failures` |

### Fingerprint requirements

Receipts must include *(secret-free)*:

- Production code hash or commit reference
- `live_config.json` SHA-256 hash
- Relevant environment-gate booleans only *(e.g. FOMO flags set/unset — not values)*
- Runtime stub fingerprint/status
- Authorization linkage references
- Process set fingerprint

### Secret-handling requirements

| Rule |
|------|
| Never print `SOLANA_SIGNER_SECRET` |
| Never dump `process.env` |
| Never include credentials or RPC secrets in receipts |

---

## 7. Regression test requirements (Implementation Gate must)

| Test coverage |
|---------------|
| Dry validator behavior unchanged |
| 85/85 remains green |
| N6 still rejects production LIVE |
| Armed validator exits 2 in dry posture |
| Armed validator fails outside LIVE_ARMED |
| Armed validator fails with executor loop |
| Armed validator fails on auth/stub/session mismatch |
| Armed validator fails on signer/public mismatch |
| Armed validator fails on RPC failure |
| Armed validator fails on open position/reconciliation/recovery |
| N6 armed probe performs no submit/broadcast |
| Production config hash unchanged after N6 armed probe |
| Skipped check cannot report PASS |
| Missing replacement evidence fails manifest |
| Deterministic machine-readable receipt |
| No production execution function invoked by preflight tests |

---

## 8. Implementation gate posture requirement

The **Armed-Context Preflight Implementation Gate** must execute while system remains:

| Field | Required |
|-------|----------|
| `liveArmed` | `false` |
| `operationalPosture` | `PIPELINE_OBSERVING` |
| Runtime R15 stub | absent |
| `FOMO_ENABLE_LIVE_SUBMISSION` | unset / not `YES` |

Implementation gate **stops before** any armed no-submit proof. Armed proof is a **later gate**.

---

## 9. Later gates still required (not authorized by this record)

| # | Gate |
|---|------|
| 1 | Armed-Context Preflight Implementation Gate *(next — bounded by this authorization)* |
| 2 | Armed-Context Preflight Regression Test Gate |
| 3 | Armed-Context Disarmed Dry Proof |
| 4 | Armed-Context Armed No-Submit Proof |
| 5 | Runbook and Governance Update |
| 6 | Fresh R15 planning |
| 7 | Fresh session — only after all prior gates pass |

---

## 10. Explicit non-authorizations (this signed record)

| Item | Status |
|------|--------|
| Code created in this gate | **No** |
| Existing production code modified | **No** |
| Existing tests modified | **No** |
| Config / `.env` changed | **No** |
| Runtime stub created | **No** |
| New R15 session | **No** |
| Re-arming | **No** |
| Submit / broadcast | **No** |
| Implementation performed | **No** |
| OR promotion / readiness claims | **No** |

---

## 11. Sign-off

| Field | Value |
|-------|-------|
| **Signer** | Taylor Cheaney |
| **Signature date** | 2026-07-08 |
| **Status** | **APPROVED** |
| **Authorized gate** | Armed-Context Preflight Implementation Gate *(one gate only)* |

Taylor authorizes the bounded future implementation described in sections 1–7, subject to all prohibitions and preservation requirements.

---

**Authorization path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Armed-Context Preflight Implementation — 2026-07-08.md`
