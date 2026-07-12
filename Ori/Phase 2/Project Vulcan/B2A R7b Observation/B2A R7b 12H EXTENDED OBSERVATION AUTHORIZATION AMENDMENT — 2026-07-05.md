# B2A/R7b 12h Extended Observation Authorization Amendment — 2026-07-05

Status:
Authorization amendment / governance only — **observation window NOT started**

Gate type:
Capture Taylor's explicit amended authorization to replace the previously authorized 2–4h rehearsal as the **next** B2A/R7b execution target with a **12h** extended dry-run/paper observation window.

Prerequisites:
- `B2A R7b OBSERVATION WINDOW PLANNING — 2026-07-04.md`
- `B2A R7b OBSERVATION WINDOW AUTHORIZATION — 2026-07-04.md` (Option B — 2–4h rehearsal)
- `FORK REGRESSION CLEANUP — Restore Canonical A4 Approval Coupling — 2026-07-04.md`
- `2026-07-04 — B2A R7b Rehearsal Interrupted Cleanup.md` (prior incomplete rehearsal — not successful)

A4 context (unchanged):
- A4 track steady-state closed (A4.41)
- `A4_VERIFIED_DEDICATED` current — **does not authorize** this observation

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
| `B2A R7b OBSERVATION WINDOW PLANNING — 2026-07-04.md` | Entry conditions E1–E13, success/failure criteria, checkpoint cadence baseline |
| `B2A R7b OBSERVATION WINDOW AUTHORIZATION — 2026-07-04.md` | Prior Option B (2–4h rehearsal) authorization |
| `FORK REGRESSION CLEANUP — Restore Canonical A4 Approval Coupling — 2026-07-04.md` | Confirms canonical A4 restored; B2A/R7b may proceed after cleanup |
| `2026-07-04 — B2A R7b Rehearsal Interrupted Cleanup.md` | Prior rehearsal incomplete; does not satisfy thresholds |

---

## 2. Prior Authorization (Superseded as Next Execution Target)

| Item | Prior state (2026-07-04) |
|------|--------------------------|
| Option | **B** — 2–4h rehearsal |
| Label | `REHEARSAL_NOT_FULL_OBSERVATION` |
| Full 24h authorized | **No** |
| Execution status | One interrupted attempt (~15–25 min; incomplete; not successful) |

The prior Option B authorization **remains on record** but is **superseded as the next execution target** by this amendment.

---

## 3. Taylor Amended Authorization

**Decision authority:** Taylor Cheaney  
**Session date:** 2026-07-05  
**Gate:** B2A/R7b 12h Extended Observation Authorization Amendment

Taylor explicitly amends authorization as follows:

> Replace the previously authorized 2–4h rehearsal as the next execution target with a **12-hour** extended dry-run/paper observation window. The 12h run is selected for schedule fit (Taylor off tomorrow; timing fits) and increased validation value versus the short rehearsal. **Composer** will be used for the future execution gate because the Fable limit was reached. This is extended observation / half-window validation — **not** the full 24h B2A/R7b observation. No live readiness. No human soak authorization. No capital exposure. No trading. OR-20260630-008 remains not_promoted. Full 24h observation requires separate authorization after 12h results review.

---

## 4. Amended Authorization Details

| Item | Value |
|------|-------|
| **Window label** | **`B2A_R7B_12H_EXTENDED_OBSERVATION_NOT_24H`** |
| **Duration target** | **12 hours** continuous (future execution gate) |
| **Supersedes as next target** | Option B 2–4h `REHEARSAL_NOT_FULL_OBSERVATION` |
| **Full 24h B2A authorized** | **No** |
| **Satisfies full B2A 24h / R7b sample thresholds** | **No** — half-window extended validation only |
| **Purpose** | Extended dry-run/paper data collection, process control, checkpoint discipline, evidence accumulation beyond short rehearsal |
| **Execution model** | **Composer** (Fable limit reached) |
| **Stack scope** | Per planning note — dry-run/paper only; `PIPELINE_DRY_RUN`; no `FOMO_ALLOW_LOOP_LIVE=YES` |

### Explicitly NOT authorized

| Item | Authorized? |
|------|-------------|
| Live readiness | **No** |
| Human soak readiness | **No** |
| Capital exposure | **No** |
| Trading / live submission | **No** |
| OR-20260630-008 promotion | **No** |
| Full 24h B2A/R7b observation | **No** — separate gate after 12h results review |
| `supportsSoakClaim` as human soak authorization | **No** — machine flag only if present during active loop |

---

## 5. Intended Checkpoint Cadence (Future Execution Gate)

| Checkpoint | Timing |
|------------|--------|
| Start | T+0 |
| +15m | 15 minutes after start |
| +1h | 1 hour after start |
| +4h | 4 hours after start |
| +6h | 6 hours after start |
| +12h | 12 hours after start (stop target) |
| Stop | At +12h or earlier abort per F1–F12 |

At each checkpoint, capture per planning note: timestamp, scanner freshness, lock heartbeat, executor loop confirmation, `/api/runtime-health` safe fields, dry-run invariants, warnings/blockers, relevant audit rows.

---

## 6. Entry Conditions (Must Re-Pass at Execution Time)

All **E1–E13** from `B2A R7b OBSERVATION WINDOW PLANNING — 2026-07-04.md` must pass **at execution time** before the 12h window may start. This amendment does not waive or pre-approve entry conditions.

Key reminders:
- E1: This amendment + future execution gate receipt
- E2: `A4_VERIFIED_DEDICATED` still current or A4.39 re-check passed
- E3–E4: `PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false`
- E5: `capitalExposure: none`
- E13: OR-20260630-008 `not_promoted`

---

## 7. Post-Run Review (Required)

After the 12h execution gate completes (or aborts), the required follow-up gate is:

**`B2A/R7b 12h Observation Results Review`**

Full 24h observation may be considered only after that review and a **separate** Taylor authorization — not implied by this amendment.

---

## 8. Boundaries Preserved

| Item | Status |
|------|--------|
| Fork regression cleanup | Complete; canonical A4 restored |
| A4 track | Steady-state closed (A4.41) |
| Prior incomplete rehearsal | Documented; does not count as 12h success |
| `.env` / secrets | Not accessed in this gate |
| Runtime processes | Not started in this gate |

---

## 9. Recommended Next Gate

**B2A/R7b 12h Extended Observation Execution** (Composer; label `B2A_R7B_12H_EXTENDED_OBSERVATION_NOT_24H`)

---

**Signed / confirmed by Taylor:** Taylor Cheaney (authorization amendment, 2026-07-05)
