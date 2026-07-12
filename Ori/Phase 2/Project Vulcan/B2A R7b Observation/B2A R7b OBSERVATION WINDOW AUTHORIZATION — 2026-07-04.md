# B2A/R7b Observation Window Authorization — 2026-07-04

Status:
Authorization / governance only — **observation window NOT started**

Gate type:
Capture Taylor's explicit authorization decision for whether a **future** B2A/R7b dry-run/paper observation **execution** gate may proceed.

Prerequisite:
`B2A R7b OBSERVATION WINDOW PLANNING — 2026-07-04.md`

A4 context (unchanged):
- A4 track steady-state closed (A4.41)
- `A4_VERIFIED_DEDICATED` current at A4.40 — **does not authorize** this observation

Live readiness:
Not claimed

Human soak readiness:
Not claimed

OR-20260630-008:
Remains **not_promoted** (unchanged)

**Code changed:** **No** · **Runtime processes started:** **No** · **Observation started:** **No**

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `B2A R7b OBSERVATION WINDOW PLANNING — 2026-07-04.md` | Planning note — options, E1–E13, S1–S11, F1–F12, cadence, boundaries |

---

## 2. Authorization Options Presented

| Option | Meaning |
|--------|---------|
| **A** | Authorize full **24h** dry-run observation execution (future gate) |
| **B** | Authorize **2–4h rehearsal** first — explicitly **not** full B2A/R7b observation |
| **C** | Hold — do not authorize observation yet |
| **D** | Request changes to entry conditions, duration, cadence, or thresholds |

**Planning recommendation:** Option **B** — first run after A4 steady-state closure; validate operator/process control before a 24h window.

---

## 3. Taylor Authorization Decision

**Decision authority:** Taylor Cheaney  
**Session date:** 2026-07-04  
**Gate:** B2A/R7b Observation Window Authorization

**Option selected:** **B — Authorize 2–4h rehearsal first**

Taylor authorizes **preparation for a future B2A/R7b Rehearsal Observation Execution gate** only. This authorization:

- Permits a **labeled rehearsal** window (target **2–4 hours**)
- Does **not** authorize starting observation in this gate
- Does **not** authorize a full **24h** B2A observation yet
- Does **not** authorize live readiness, human soak readiness, capital exposure, trading, or OR promotion

**Taylor's explicit statement (recorded):**

> Authorize Option B: a 2–4 hour rehearsal observation first, explicitly labeled rehearsal only, not a full B2A/R7b observation. Purpose is process and control validation after A4 steady-state closure before any 24h window. No live readiness. No human soak authorization. No capital exposure. OR-20260630-008 remains not_promoted. Full 24h observation requires a separate authorization after rehearsal review.

---

## 4. Option B — Rehearsal Authorization Details

| Item | Value |
|------|-------|
| Window label | **`REHEARSAL_NOT_FULL_OBSERVATION`** |
| Duration target | **2–4 hours** (operator selects within range at execution gate) |
| Full 24h B2A authorized | **No** — not in this authorization |
| Satisfies full B2A/R7b thresholds | **No** — rehearsal alone does not meet R7b sample requirements |
| Purpose | Process/control validation: start → checkpoints (start, +15m, +1h) → stop → rollback → runtime-health before/after |
| Stack scope | Per planning note — dry-run/paper only; entry conditions E1–E13 apply at execution gate |
| Checkpoint cadence (rehearsal) | **Start, +15m, +1h, stop** only (not 6h/12h/24h) |
| Post-rehearsal requirement | **B2A/R7b Rehearsal Results Review** before any full 24h authorization (Option A) |

---

## 5. What This Authorization Does **Not** Authorize

| Not authorized | Notes |
|----------------|-------|
| Starting scanner/executor **now** | Execution is a **separate future gate** |
| Full **24h** observation | Requires separate authorization after rehearsal review |
| Live readiness | `supportsLiveReadiness` remains false |
| Human soak authorization | `supportsSoakClaim` machine flag only |
| Capital exposure | `capitalExposure` remains none |
| Trading / liveArmed | Not authorized |
| OR-20260630-008 promotion | Remains **not_promoted** |
| B2A/R7b Observation Results Review (full) | Only **rehearsal review** after rehearsal execution |
| Changes to `.env` or secrets | Not part of this track |

---

## 6. Authorized Next Action (Future Gate Only)

| Authorized | Gate name (recommended) |
|------------|-------------------------|
| **Yes** — rehearsal execution only | **B2A/R7b Rehearsal Observation Execution** |

Execution gate must:
- Satisfy entry conditions **E1–E13** from planning note
- Label window **`REHEARSAL_NOT_FULL_OBSERVATION`**
- Run **2–4h** only
- Use planning note commands **without** claiming full B2A completion
- Stop per planning note §10 (Ctrl+C preferred)
- Produce rehearsal receipt + checkpoint snapshots

**Not authorized yet:** **B2A/R7b Full 24h Observation Execution**

---

## 7. Safety Confirmation (This Gate)

| Check | Result |
|-------|--------|
| Observation started in this gate | **No** |
| Scanner/executor started | **No** |
| Live trading | **No** |
| Capital exposure enabled | **No** |
| OR-20260630-008 promoted | **No** — **not_promoted** |
| Promotion authorized | **No** |
| Live readiness claimed | **No** |
| Human soak readiness claimed | **No** |
| Code changed | **No** |
| `.env` opened | **No** |
| Secrets inspected | **No** |
| `process.env` dumped | **No** |

---

## 8. Required Output Summary

| Item | Answer |
|------|--------|
| Authorization note path | `Ori/Phase 2/Project Vulcan/B2A R7b Observation/B2A R7b OBSERVATION WINDOW AUTHORIZATION — 2026-07-04.md` |
| Taylor option selected | **B** |
| Observation execution authorized for future gate | **Yes** — **rehearsal only** (2–4h) |
| This gate started observation | **No** |
| Full 24h run authorized | **No** — rehearsal first |
| OR-20260630-008 after gate | **not_promoted** |

---

## 9. Recommended Next Gate

**B2A/R7b Rehearsal Observation Execution** — run labeled 2–4h rehearsal per planning note entry conditions; no live/capital/OR promotion; stop and review before any 24h authorization.
