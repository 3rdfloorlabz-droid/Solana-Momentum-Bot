# DECISION — Armed-Context Preflight Architecture — 2026-07-08

Status:
**APPROVED**

Decision owner:
**Taylor Cheaney**

Decision date:
**2026-07-08**

Affected domain:
**Project Vulcan Live Readiness**

Originating incident:
**RB-G9-20260707-EV02**

Incident classification:
**ABORTED_BEFORE_BROADCAST**

Capital exposure (incident):
**none**

Decision type:
Validation architecture · fail-closed governance boundary

Planning reference:
[`../ARMED-CONTEXT PREFLIGHT ARCHITECTURE PLANNING — 2026-07-08.md`](../ARMED-CONTEXT%20PREFLIGHT%20ARCHITECTURE%20PLANNING%20%E2%80%94%202026-07-08.md)

Gate receipt:
[`../ARMED-CONTEXT PREFLIGHT ARCHITECTURE DECISION — 2026-07-08.md`](../ARMED-CONTEXT%20PREFLIGHT%20ARCHITECTURE%20DECISION%20%E2%80%94%202026-07-08.md)

---

## 1. Decision summary

Taylor **approves** the separation of live-readiness validation into three formally distinct domains and **selects Option B** as the canonical future implementation architecture:

- **Domain A — Disarmed Readiness Validation** *(existing dry tooling, unchanged)*
- **Domain B — Armed-Context Execution Preflight** *(new dedicated toolchain)*
- **Domain C — Post-Disarm Closure Validation** *(same as Domain A after disarm)*

This decision **does not authorize implementation**, re-arming, a new R15 session, or any execution.

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

---

## 2. Structural conflict (formally adopted)

The following four requirements **cannot hold simultaneously**:

| Requirement | Source |
|-------------|--------|
| `liveArmed: true` · `LIVE_ARMED` · `executionMode: LIVE` · `dryRunMode: false` | Authorized arming + micro-live execution posture |
| `validate_live_system.js` PASS | Requires `dryRunMode === true` (`validate_live_system.js:176`) |
| `run_safety_tests.js` fully green incl. N6 | `test_n6_estop_drill.js` E0 aborts production `executionMode === "LIVE"` (`test_n6_estop_drill.js:314`) |
| Full green before quote/confirmation | Fresh Micro-Live Single-Trade Execution Gate Phase 1 policy |

**Conclusion:** EV02 abort was **correct**. The prior execution gate preflight policy was structurally incompatible with the authorized armed state. Future gates must use **domain-appropriate** validation, never dry-domain PASS inference while armed.

---

## 3. Three-domain model (adopted)

### Domain A — Disarmed Readiness Validation

| Field | Requirement |
|-------|-------------|
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| `liveArmed` | `false` |
| `FOMO_ENABLE_LIVE_SUBMISSION` | unset / not `YES` |
| Commands | `node validate_live_system.js` · `node run_safety_tests.js` (full 85 incl. N6) |
| Runtime R15 stub | absent · not required |
| Establishes | Eligibility to **begin** a governed arming workflow only |

### Domain B — Armed-Context Execution Preflight

| Field | Requirement |
|-------|-------------|
| `executionMode` | `LIVE` |
| `dryRunMode` | `false` |
| `liveArmed` | `true` |
| Authorization chain | valid signed R15 · arming · micro-live · stub creation |
| Runtime R15 stub | present · session-bound |
| Process state | 0 executor loops · flat positions/reconciliation/recovery · no capital exposure |
| Verification | signer/public match · RPC read-only · armed-safe guard probes · candidate/route · Jupiter adapter · N6 armed-safe replacement |
| Exclusions | No dry-only validator requirement · no production-mutating N6 drill |
| Establishes | Eligibility to proceed to **quote + final per-trade confirmation** only |

### Domain C — Post-Disarm Closure Validation

| Field | Requirement |
|-------|-------------|
| C1–C3 | reversed |
| `liveArmed` | `false` |
| Posture | dry restored |
| Runtime stub | removed/consumed |
| State | flat/reconciled |
| Commands | Domain A full validator + full safety suite incl. N6 |
| Establishes | Session may close · RB-G9 may file |

**Cross-domain rule:** No domain may treat another domain's skipped or inapplicable checks as PASS.

---

## 4. Selected architecture — Option B (approved)

| Component | Status |
|-----------|--------|
| `validate_live_system.js` | **Retain unchanged** — Domain A/C only |
| `run_safety_tests.js` | **Retain unchanged** — Domain A/C only |
| `validate_armed_preflight.js` | **Approved for future creation** — Domain B static/runtime checks |
| `run_armed_preflight_manifest.js` | **Approved for future creation** — governed AP-01–AP-20 runner |
| `test_n6_armed_estop_probe.js` | **Approved for future creation** — Domain B N6 replacement |
| Shared posture-independent library | **Approved** — e.g. `live_validation_common.js` |
| Dry tooling behavioral semantics | **Must remain unchanged** |

---

## 5. Rejected alternatives

### Option A — `validate_live_system.js --context armed-preflight`

**Rejected.**

| Reason |
|--------|
| Increases accidental wrong-context invocation risk |
| Mixes dry and armed policy in one operator command |
| Weakens clarity and audit boundaries |

### Option C — Filtered `run_safety_tests.js` with generic exclusions

**Rejected.**

| Reason |
|--------|
| Skipped checks could be misunderstood as PASS |
| Higher drift and audit risk |
| Encourages broad waiver behavior |

### Prohibited patterns (also rejected)

| Pattern | Status |
|---------|--------|
| Broad waiver flags | **Forbidden** |
| Safety-off environment variables | **Forbidden** |
| Generic skip lists | **Forbidden** |
| Silent exclusions | **Forbidden** |
| SKIP or N/A reported as PASS | **Forbidden** |
| Bypassing failed dry test while armed | **Forbidden** |

---

## 6. Armed manifest AP-01 through AP-20 (adopted)

Every manifest item must return exactly one of:

- **PASS**
- **FAIL**
- **NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE**

| ID | Check |
|----|-------|
| **AP-01** | Production posture LIVE_ARMED (`liveArmed`, `executionMode`, `dryRunMode`, FOMO flag) |
| **AP-02** | Signed authorizations valid (R15 · arming · micro-live · stub creation) |
| **AP-03** | Runtime stub present · session-bound · ack fields |
| **AP-04** | Executor loop count = 0 · no `--loop` PID |
| **AP-05** | Singleton lock state documented (stale OK if no loop) |
| **AP-06** | Open positions = 0 |
| **AP-07** | Pending reconciliation = 0 |
| **AP-08** | Recovery actions = none / documented |
| **AP-09** | Capital exposure = none |
| **AP-10** | Signer env present · wallet match *(no secret dump)* |
| **AP-11** | Dedicated RPC read-only OK |
| **AP-12** | `collectLiveSubmissionGateFailures` all pass |
| **AP-13** | R15 `assertMicroLiveApprovalRecord` PASS |
| **AP-14** | BUY no-submit guard probe PASS |
| **AP-15** | Candidate packet bounds (size · CS rules) |
| **AP-16** | Jupiter quote/build read-only probe (lite-api `/swap/v1`) |
| **AP-17** | N6 armed-safe e-stop probe |
| **AP-18** | Config hash matches arming baseline or documented drift |
| **AP-19** | OR-20260630-008 not_promoted |
| **AP-20** | `test_r16_live_path_coupling.js` (mocked LIVE path) |

**Dry-only replacements (mandatory when armed):**

| Dry check | Armed replacement |
|-----------|-------------------|
| `validate_live_system`: `dryRunMode === true` | AP-01 |
| `validate_live_system`: `executionMode is non-live` | AP-01 |
| `test_n6_estop_drill.js` full E0–E10 | AP-17 |
| `test_pipeline_dry_run.js` | AP-12 + AP-14 |
| `test_pipeline_candidate_handoff.js` dry branch | AP-14 |

---

## 7. N6 armed-safe replacement (adopted design)

Future `test_n6_armed_estop_probe.js` **must**:

| Requirement | Detail |
|-------------|--------|
| Posture gate | Require LIVE_ARMED; abort if disarmed |
| E-stop config | Read-only verification on production config |
| Halt precedence | Temp isolated harness (`TRACKTA_RUNTIME_ROOT`) |
| No submit/sign/broadcast | Controlled guard-path invocation only |
| No position | Must not create live position |
| Production config | Unchanged — hash verified before and after |
| Entry rejection | Assert entry blocked after halt assertion in harness |
| Ambiguity | Fail closed |
| Domain scope | **Never** replaces full dry N6 for Domains A or C |

---

## 8. Armed validator contract (adopted)

Future `validate_armed_preflight.js` **must**:

| Requirement | Detail |
|-------------|--------|
| Exit 2 | When invoked outside LIVE_ARMED posture |
| Exit nonzero | On any failed mandatory check |
| No execution side effects | No submit · sign · broadcast |
| No state mutation | No config change · no stub · no positions · no reconciliation |
| Machine-readable output | JSON with check ID · status · evidence · timestamp · rationale |
| Status distinction | FAIL vs NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE |
| Fingerprints | code/config/process/auth fingerprints in receipt |

---

## 9. Manifest-runner contract (adopted)

Future `run_armed_preflight_manifest.js` **must**:

| Requirement | Detail |
|-------------|--------|
| Scope | Execute only AP-01 through AP-20 |
| Manifest integrity | Fail on unknown · missing · duplicate · security-relevant reorder |
| Evidence | Fail if any result missing evidence |
| Replacement | Fail if dry-only exclusion lacks approved replacement evidence |
| Aggregate PASS | Only when every required condition satisfied |
| Receipt | Machine-readable aggregate receipt |
| No real execution | Must not invoke production execution paths |

---

## 10. Evidence freshness (adopted)

| Evidence | Max age / rule |
|----------|----------------|
| Domain A dry validation | **30 minutes** before arming |
| Domain B armed preflight | **15 minutes** before candidate quote and confirmation |
| Candidate execution quote | **10 seconds** maximum age |
| Immediate guard probe | **Immediately** before submit |
| Material drift | Invalidates all prior evidence in affected domain |

---

## 11. Transition invariants (adopted)

```text
PIPELINE_OBSERVING
  → Dry Readiness PASS (Domain A)
  → Arming Authorization
  → C1–C3
  → LIVE_ARMED
  → Armed Preflight PASS (Domain B)
  → Candidate Packet
  → Exact Per-Trade Confirmation
  → Immediate Guard Probe
  → Single Authorized Execution
  → Mandatory Exit
  → Disarm
  → Closure Validation (Domain C)
  → RB-G9
```

Armed preflight **must occur after arming** and **before** quote presentation. Dry validation evidence **must be fresh** within the adopted window before arming.

---

## 12. Invalidation triggers (adopted)

Any of the following voids applicable domain evidence:

- Production code hash drift
- `live_config.json` hash drift
- Environment-gate drift (C1/C3 flags)
- Process set changes · executor loop appearance
- Authorization or runtime-stub drift
- Signer/public-address mismatch
- RPC failure or endpoint drift
- Candidate or route drift
- E-stop ambiguity
- Safety check failure
- Open position · pending reconciliation · recovery state
- Capital exposure before authorization
- OR status change
- Secret exposure
- Evidence expiration

---

## 13. Implementation governance sequence (adopted)

| Step | Gate |
|------|------|
| 1 | **Architecture Decision** *(this record)* |
| 2 | Armed-Context Preflight Implementation Authorization |
| 3 | Implementation Gate |
| 4 | Regression Test Gate |
| 5 | Disarmed Dry Proof |
| 6 | Armed No-Submit Proof |
| 7 | Runbook and governance update |
| 8 | Fresh R15 planning |
| 9 | Fresh session — **only after steps 1–8 pass** |

**EV02 (`RB-G9-20260707-EV02`) must not be reused.**

---

## 14. Minimum regression requirements (adopted)

| Requirement |
|-------------|
| Existing dry validator behavior unchanged |
| Existing 85/85 dry safety suite unchanged |
| Existing N6 rejects inappropriate production LIVE execution |
| Armed validator rejects dry posture with exit 2 |
| Armed validator fails if not LIVE_ARMED |
| Armed validator fails if executor loop exists |
| Armed validator fails on stub/auth/session mismatch |
| Armed validator fails on signer/public mismatch |
| Armed validator fails on RPC failure |
| Armed validator fails on open position/reconciliation/recovery |
| Armed-safe N6 probe performs no submit/broadcast |
| Config hash unchanged after armed-safe N6 probe |
| No skipped check reported as PASS |
| Missing replacement evidence fails manifest |
| Machine-readable receipts deterministic |
| Production execution functions not called by any preflight test |

---

## 15. Architecture boundaries (explicit non-authorizations)

| Item | Status |
|------|--------|
| Implementation authorized | **No** |
| New live session approved | **No** |
| Existing safety policy waived | **No** |
| EV02 reclassified | **No** — remains ABORTED_BEFORE_BROADCAST |
| Strategy readiness established | **No** |
| OR-20260630-008 promoted | **No** |
| Readiness / edge / profitability claim | **No** |

---

## 16. Sign-off

| Field | Value |
|-------|-------|
| **Decision owner** | Taylor Cheaney |
| **Decision date** | 2026-07-08 |
| **Decision status** | **APPROVED** |
| **Implementation authorized** | **No** |

---

**Decision path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Decisions/DECISION — Armed-Context Preflight Architecture — 2026-07-08.md`
