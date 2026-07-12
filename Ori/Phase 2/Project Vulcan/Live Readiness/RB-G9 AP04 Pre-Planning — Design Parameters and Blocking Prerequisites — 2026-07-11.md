---
type: pre-planning
area: rb-g9-armed-continuum
status: DESIGN NOTES ONLY — NOT A SESSION — NOT AN AUTHORIZATION
capitalExposure: none
---

# RB-G9 AP04 Pre-Planning — Design Parameters and Blocking Prerequisites — 2026-07-11

Upstream: [`Decisions/DECISION — RB-G9 Armed Continuum Remediation Acceptance — 2026-07-11.md`](Decisions/DECISION%20%E2%80%94%20RB-G9%20Armed%20Continuum%20Remediation%20Acceptance%20%E2%80%94%202026-07-11.md) §9 item 9 · [`RB-G9 F4 Adapter Implementation and Pre-Production-Integration Follow-Up Disposition — 2026-07-11.md`](RB-G9%20F4%20Adapter%20Implementation%20and%20Pre-Production-Integration%20Follow-Up%20Disposition%20%E2%80%94%202026-07-11.md) · [`Sessions/README.md`](Sessions/README.md) · [`Authorizations/README.md`](Authorizations/README.md)

## What this document is and is not

This is a **design/readiness note**, not a session. It does **not**:

- create a `Sessions/SESSION — RB-G9-<date>-AP04 — <date>/` folder
- draft, pre-fill, or sign any G1, G2, G3, or G4 authorization
- select an operating block, proof day, or arming window
- request the separate **"RB-G9 Armed Continuum Production Integration Authorization"** gate that §6 of the acceptance decision requires

It exists so that when the operator is ready to open AP04, the design constraints are already written down in one place instead of re-derived under time pressure — which is itself one of the risks this project's own governance-integrity work is trying to reduce.

## 1. AP04 cannot open yet — current blockers

| Prerequisite (DECISION §9 / §17 of the governance-integrity plan) | Status |
|---|---|
| F4 real AP adapter design + implementation | **Done** — `f4_ap_adapter.js`, tested |
| F4 real N6 adapter design + implementation | **Done** — `f4_n6_adapter.js`, tested |
| Independent no-submit import review of adapter wiring | **Done** — `verify_f4_adapter_boundary.js`, tested |
| Forward-jump anomaly disposition | **Done** — wired into `enforceMonotonicCheckpoint`, tested |
| Stale-G1 continuum integration coverage | **Done** — `test_armed_continuum_gap_coverage.js`, tested |
| Illegal pre-C1 transition coverage | **Done** — same file, tested |
| **Separate "RB-G9 Armed Continuum Production Integration Authorization" gate** | **Not sought.** This document does not request it. |
| Governance record-integrity implementation (Git baseline + checkpoint manifest) | **Partially done** — checkpoint-manifest tooling live; Git baseline blocked on an active `git.exe` process / stale `.git/index.lock` in the repo; operator action needed |
| `.git/index.lock` resolved under authorization | **Not done** |
| Current machine posture revalidated | **Done** — see the F4 disposition doc above, same date |
| No AP03 evidence/authority reuse | Applies going forward — see §2 |

AP04 remains blocked on the unresolved Git lock and the still-unsought production-integration authorization gate, independent of anything in this document.

## 2. Why AP01/AP02/AP03 cannot be reused (restated for AP04's benefit)

| Session | Disposition | Why it cannot back AP04 |
|---|---|---|
| `RB-G9-20260709-AP01` | `SUPERSEDED_BEFORE_EXECUTION — EXPIRED_UNUSED` · never armed | G1–G4 fingerprints closed and marked non-reusable in `Authorizations/README.md` |
| `RB-G9-20260713-AP02` | Superseded before execution · timing defect in original G1 | Explicitly "no new AP02 authorization permitted" |
| `RB-G9-20260711-AP03` | Armed → `INSUFFICIENT_ARMED_WINDOW` → fail-closed rollback · G2/G3/Process-Isolation **used/consumed**, G1/G4 closed unused | Every G1–G4 fingerprint for AP03 is marked "do not reuse" in the index; G2 and G3 were actually consumed (C1–C3 ran, stub was created) so reusing them would mean skipping arming/stub steps AP04 must perform fresh |

**Design rule for AP04:** every one of G1, G2, G3, G4 must be a **freshly signed document with a new fingerprint**, generated after AP04's own session ID exists. None may reference, embed, or derive from an AP01/AP02/AP03 fingerprint. `FORBIDDEN_SESSION_IDS` in `armed_preflight_session.js` currently lists two closed EV-series sessions (`RB-G9-20260706-EV01`, `RB-G9-20260707-EV02`) as a hard-coded, machine-enforced non-reuse list — AP01/AP02/AP03 are not yet in that list (they're closed by index/documentation convention, not by code). Whoever designs AP04 for real should decide whether to extend that hard-coded list before AP04 opens, so non-reuse is enforced by the code path itself and not only by the paper trail.

## 3. New session ID

Per `armed_preflight_session.js`'s `SESSION_ID_PATTERN` (`/^RB-G9-\d{8}-AP\d{2}$/`), the next session in sequence is `RB-G9-<proof-day-YYYYMMDD>-AP04` — the date component is bound to whatever proof day the operator actually selects, not chosen here.

## 4. New Domain A / isolation proof

AP03's Domain A and process-isolation receipts are session-bound (`sessionId` field checked against `cli.sessionId` in `runPrecheck`) and their hashes are recorded as consumed. AP04 needs:

- A fresh Domain A (disarmed-readiness) receipt captured within `DOMAIN_A_FRESHNESS_BEFORE_C1_MS` (12 minutes) of C1, per existing precheck logic — this is unchanged from AP03's design, just re-run.
- A fresh process-isolation proof binding a new `isolatedProcessSetHash` to the new session ID, following whatever procedure produced AP03's (not audited/re-verified as part of this document — out of scope here).

## 5. New G1–G4

Structure unchanged from the accepted design (restated, not redesigned):

- **G1** — proof-day authorization, subject to `validateProofDayG1`: must be signed *on* the selected proof day (local date match), must not be reused/consumed, expiry must clear `blockEnd + G1_POST_BLOCK_MARGIN_MS` (1 hour) and must not itself be expired at continuum invocation time. AP04's own gap-coverage tests (`test_armed_continuum_gap_coverage.js`) now directly exercise the time-expiry path this checks, independent of the reuse-marker path AP03's evidence already covered.
- **G2** — arming authorization, consumed at C1.
- **G3** — runtime stub creation authorization, consumed at STUB.
- **G4** — armed no-submit proof authorization, gating AP/N6.

## 6. Proof-day G1 timing (restated constants, unchanged)

| Constant | Value |
|---|---|
| Armed cap | 15 minutes |
| Minimum remaining after stub | 12 minutes |
| Minimum remaining at AP | 10 minutes |
| Minimum remaining at N6 | 8 minutes |
| Domain C reserve | 3 minutes |
| Max stub→AP delay | 2 minutes |
| Max AP→N6 delay | 15 seconds |
| Max rollback-initiation delay | 5 seconds |
| G1 post-block margin | 1 hour |
| **New this pass:** max forward jump per checkpoint | 15 minutes (`ARMED_CAP_MS`) — see the F4 disposition doc §9 item 4 |

AP03's own closure record shows it failed on `INSUFFICIENT_ARMED_WINDOW` — a timing defect in how much runway existed after stub creation, not a design flaw in the constants themselves. Whoever plans AP04's actual proof-day window should size the *operator's own available time* around these floors with real margin, not just the code's minimums — that appears to be what went wrong for AP03, not the code.

## 7. What "opening AP04" will actually require, when the operator is ready

1. Resolve the `.git/index.lock` / active `git.exe` process (operator action — see the governance-integrity plan §14).
2. Complete the Git baseline commit for governance records (this document included).
3. Seek and receive the separate **RB-G9 Armed Continuum Production Integration Authorization** gate — a human decision, not an engineering task.
4. Select a real proof day and operating block with realistic margin per §6.
5. Sign fresh G1–G4 for the new session ID, with fresh fingerprints, per §5.
6. Capture fresh Domain A and process-isolation receipts per §4.
7. Only then create the `Sessions/SESSION — RB-G9-<date>-AP04 — <date>/` folder and the actual authorization files — none of which this document creates.

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 AP04 Pre-Planning — Design Parameters and Blocking Prerequisites — 2026-07-11.md`
