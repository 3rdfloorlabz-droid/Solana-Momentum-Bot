# RB-G9-20260711-AP03 Armed No-Submit Proof Gate — 2026-07-11

Status:
**FAIL CLOSED — INSUFFICIENT_ARMED_WINDOW — AP/N6 NOT INVOKED — DOMAIN C ROLLBACK PERFORMED**

Gate type:
Session-bound armed no-submit engineering proof — AP-01–AP-20 manifest + armed-safe N6 (aborted before invocation)

Prerequisites:
`RB-G9-20260711-AP03 RUNTIME STUB CREATION GATE — 2026-07-11.md` **PASS** · G1/G4 SIGNED/UNUSED · G2/G3 CONSUMED/USED · isolation CONSUMED/USED · runtime stub present at gate start

Gate date:
**2026-07-11**

Session:
**RB-G9-20260711-AP03**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**AP/N6 invoked:** **No** · **G4 consumed:** **No** · **Domain C rollback:** **Yes** · **Submit/sign/broadcast:** **No**

---

## 1. Prominent post-gate state

> **DISARMED · PIPELINE_OBSERVING**
>
> **ARMED NO-SUBMIT PROOF NOT EXECUTED**
>
> **AP/N6 NOT INVOKED**
>
> **RUNTIME STUB REMOVED (Domain C rollback)**

---

## 2. Timing and abort

| Field | Value |
|-------|-------|
| **Proof-gate start UTC** | `2026-07-11T20:24:52.447Z` |
| **Proof-gate completion UTC** | `2026-07-11T20:24:54.124Z` |
| **armedStartUtc** | `2026-07-11T20:17:50.496Z` |
| **armedDeadlineUtc** | `2026-07-11T20:32:50.496Z` |
| **Armed time remaining at gate start** | **~7.97 minutes** (`478049` ms) |
| **Minimum required before AP invocation** | **10 minutes** (`600000` ms) |
| **AP invocation UTC** | **none** — aborted |
| **AP completion UTC** | **none** |
| **N6 invocation UTC** | **none** |
| **N6 completion UTC** | **none** |
| **Armed time remaining at proof completion** | **~7.94 minutes** (`476372` ms) |
| **Abort reason** | **`INSUFFICIENT_ARMED_WINDOW`** |

**Note:** Runtime Stub Creation Gate completed at `2026-07-11T20:22:21Z` with **~10.5 minutes** armed time remaining — sufficient for AP if proof gate had started immediately. Delay between stub gate completion and proof gate start consumed the required 10-minute AP buffer.

---

## 3. Authorization validation (pre-invocation)

| Gate | Fingerprint | Status |
|------|-------------|--------|
| **G1** | `2271bfc79a75f798c40adf54f2b25822bd3b7f44f473ba4ed89e6a63eff92e7e` | **PASS · SIGNED/UNUSED · unexpired** |
| **G2** | `1d0640d2410cde85f281763e70fc1fcb35d52fa55eee98f23e6c169f5d7659c1` | **PASS · CONSUMED/USED · C1–C3 complete** |
| **G3** | `7ab18a9e0ad199248b2b9b5865556db15e75a4cacd6067639b250fa970d7a010` | **PASS · CONSUMED/USED · stub created once** |
| **G4** | `cea4084e77aaa6bd5aece3dd8da7ba9d15112150f164b41d80cac80aac4b801a` | **PASS · SIGNED/UNUSED** *(not consumed — proof not executed)* |
| **Process Isolation Authorization** | `836e413d9da0f8580017e903306e40647aecc7b9866a0a3e828b69c6af545cd3` | **PASS · CONSUMED/USED** |

---

## 4. Baseline bindings

| Binding | Value | Match |
|---------|-------|-------|
| **armingBaselineHash** | `900349be9183d545b9993bc75af7346c094653e2d6079792f4be6928259cf5b0` | **Yes** |
| **isolatedProcessSetHash** | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` | **Yes** |

---

## 5. Runtime stub validation (pre-rollback)

| Field | Value |
|-------|-------|
| **Path** | `analysis/r15_manual_approval_record.json` |
| **Fingerprint** | `348b8e9a83fc49b3fbe05a8cbe03b037a37295d3c8ea26fb2846ba43ad0c085f` |
| **expectedPurpose validation** | **PASS** |
| **Micro-live guard rejects proof stub** | **Yes** |
| **Temporary stub** | absent |

---

## 6. Pre-invocation safety

| Check | Result |
|-------|--------|
| Candidate selected | **No** |
| Quote requested | **No** |
| Transaction constructed | **No** |
| Submit/sign/broadcast | **No** |
| Transaction signatures | **none** |
| Position/reconciliation/recovery/capital | **none** |
| Executor count | **0** |
| Monitor/dashboard/scanner | **0** |

---

## 7. AP/N6 results

**Not invoked** — fail-closed before AP invocation due to insufficient armed window.

| AP check | Status |
|----------|--------|
| **AP-01 through AP-20** | **not run** |
| **AP-15** | **not run** |
| **Armed-safe N6** | **not run** |

---

## 8. Domain C rollback

| Action | Performed |
|--------|-----------|
| `FOMO_ENABLE_LIVE_SUBMISSION` unset | **Yes** |
| `executionMode` → `PIPELINE_DRY_RUN` | **Yes** |
| `dryRunMode` → `true` | **Yes** |
| Runtime stub removed | **Yes** |
| Processes restored | **No** |

Post-rollback posture: `PIPELINE_OBSERVING` · `liveArmed: false`

---

## 9. Machine receipt

`analysis/rb_g9_20260711_ap03_armed_no_submit_proof_receipt.json`

Capture script:
`analysis/rb_g9_ap03_armed_no_submit_proof_gate_capture.js`

---

## 10. Recommended next gate

**RB-G9-20260711-AP03 Emergency Domain C Closure**

---

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9-20260711-AP03 ARMED NO-SUBMIT PROOF GATE — 2026-07-11.md`
