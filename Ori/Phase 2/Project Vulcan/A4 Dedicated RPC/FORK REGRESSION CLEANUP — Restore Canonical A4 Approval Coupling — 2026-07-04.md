# FORK REGRESSION CLEANUP — Restore Canonical A4 Approval Coupling — 2026-07-04

Status:
**Cleanup complete**

Gate type:
Fork reconciliation / regression cleanup (not a new A4 implementation gate)

Determination:
**Canonical A4.25/A4.35/A4.40 approval-coupling behavior restored**

---

## 1. Problem

An alternate fork re-implemented A4 approval coupling under wrong numbering:

| Fork label | Canonical equivalent | Issue |
|------------|---------------------|-------|
| Fork A4.26 implementation | A4.25 implementation | Duplicate |
| Fork A4.27 emit recommendation | A4.35 verification | Already complete |

Fork code introduced hard requirements on fields absent from the live A4.35 approval row (`approvalScope`, `secretSafe`, grant flags). Under fork code, the canonical A4.35 happy path mapped to `A4_STABILITY_PROOF_OBSERVED` instead of `A4_VERIFIED_DEDICATED` — a regression against the closed A4 track (A4.41).

---

## 2. Actions Taken

### Code restored to canonical A4.25 behavior

| File | Action |
|------|--------|
| `a4_approval.js` | Restored canonical payload (no fork-only grant flags / approvalScope hard req) |
| `a4_approval_emit.js` | Restored canonical CLI (`--status`, no `--emit-approved` gate) |
| `runtime_evidence.js` | Restored `extractA4ApprovalFacts` + `buildA4ApprovalEvidence` |
| `runtime_health.js` | Restored A4.25 elevation guards |
| `dashboard_server.js` | Restored A4.25 approval display allowlist |
| `test_a4_approval.js` | Restored canonical tests |
| `test_a4_approval_emit.js` | **Removed** (fork-only) |
| `test_a4_runtime_evidence.js` | Restored fixtures |
| `test_a4_runtime_health.js` | Restored + added `canonical_a4_35_live_approval_payload_maps_to_verified_dedicated` |
| `test_a4_dashboard_runtime_health.js` | Restored display allowlist test |

### Fork docs

| Item | Handling |
|------|----------|
| Fork `A4.26 IMPLEMENTATION NOTE — Approval Emit Tool and Runtime Coupling.md` | **Moved** to `Fork Rejected/REJECTED — A4.26 IMPLEMENTATION NOTE — Approval Emit Tool and Runtime Coupling.md` with rejection header |
| Canonical A4.26 | Remains **`A4.26 RUNTIME AMBIGUITY BOUNDARY AUDIT`** (unchanged) |

### Cursor Run Log

Fork rows **not deleted** (history preserved):

- `A4.24 Finalize A4 Stability Proof Decision` — harmless duplicate doc touch; decision restored to A4.34-compatible wording with correct A4.25/A4.35 gate refs
- `A4.26 A4 Approval Emit Tool & Runtime Coupling Implementation` — **superseded/rejected** by this cleanup row

### A4.24 decision record

Restored canonical A4.34-compatible approval block:

- `APPROVED_BY_TAYLOR`
- Conditions reference **A4.25 + A4.35** (not fork A4.26/A4.27)
- Removed incorrect fork gate references from approval note

---

## 3. Verification

### Tests (all pass)

| Suite | Result |
|-------|--------|
| `test_a4_approval.js` | 3 passed |
| `test_a4_runtime_evidence.js` | 42 passed |
| `test_a4_runtime_health.js` | 41 passed (includes A4.35 live-row regression) |
| `test_a4_dashboard_runtime_health.js` | 17 passed |

### Read-only live-row compatibility check

Live A4.35 approval row (`approver: Taylor`, no fork-only fields):

- `buildA4ApprovalEvidence(...).approved`: **true**
- Simulated guarded mapping: **`A4_VERIFIED_DEDICATED`**
- `supportsLiveReadiness`: **false**

---

## 4. Boundaries (unchanged)

| Item | Status |
|------|--------|
| Approval event emitted | **No** |
| Runtime processes started | **No** |
| Live readiness claimed | **No** |
| Human soak readiness claimed | **No** |
| OR-20260630-008 promoted | **No** (`not_promoted`) |
| Capital exposure enabled | **No** |
| `.env` / secrets / process.env | **Not touched** |
| A4 track reopened | **No** — remains closed at A4.41 |

---

## 5. Recommended Next Gate

**B2A/R7b Rehearsal Restart Planning** (active track; prior interrupted rehearsal documented)

---

**Code changed:** Yes (cleanup revert) · **Approval emitted:** No · **A4 track status:** Steady-state closed (A4.41)
