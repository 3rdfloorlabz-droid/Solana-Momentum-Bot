---
type: checklist
area: rb-g9-armed-continuum
status: REFERENCE CHECKLIST — DOES NOT AUTHORIZE ANYTHING BY ITSELF
capitalExposure: none
---

# RB-G9 Armed Continuum Pre-Arming Checklist — 2026-07-11

Upstream: [`RB-G9 AP04 Pre-Planning — Design Parameters and Blocking Prerequisites — 2026-07-11.md`](RB-G9%20AP04%20Pre-Planning%20%E2%80%94%20Design%20Parameters%20and%20Blocking%20Prerequisites%20%E2%80%94%202026-07-11.md) · `docs/ARMED_PREFLIGHT.md` · `LIVE_AUTHORIZATION_RECORD.md`

**Purpose:** one consolidated checklist to work through before the operator actually invokes `run_armed_continuum.js` for a real (non-`--dry-rehearsal`) session. This document does not perform, authorize, or simulate any of these steps — it is a reading aid, assembled from documents that already exist and are individually authoritative. If this checklist and any underlying document disagree, the underlying document wins.

## A. Governance / authorization gates (must all be true first)

- [ ] The separate **RB-G9 Armed Continuum Production Integration Authorization** gate has been sought and granted (§6 of the acceptance decision) — engineering completion of F4 is not this gate.
- [ ] `.git/index.lock` resolved and the governance-record Git baseline committed (see the governance-integrity plan §14 for the required procedure — do not delete the lock file without first confirming no real git process is running).
- [ ] Session ID assigned following `RB-G9-<proof-day-YYYYMMDD>-AP04` (or whatever the actual next sequence number is), not reusing AP01/AP02/AP03.
- [ ] G1–G4 freshly signed for this session ID, each with its own new fingerprint, none copied or derived from a prior session's signed body.
- [ ] Fresh Domain A (disarmed-readiness) receipt captured, timestamped within `DOMAIN_A_FRESHNESS_BEFORE_C1_MS` (12 minutes) of the planned C1 start.
- [ ] Fresh process-isolation proof captured and bound to this session ID.

## B. Timing window (use the calculator — do not eyeball it)

- [ ] Run `npm run calculate:armed-window -- --c1-start-utc <planned start> --stub-duration-ms <realistic estimate> --ap-duration-ms <realistic estimate> --n6-duration-ms <realistic estimate>` and confirm `Overall: feasible`.
- [ ] The duration estimates fed into the calculator are based on how long AP03 (or another real prior run) actually took at each stage, not the theoretical minimum — AP03's own recorded failure was `INSUFFICIENT_ARMED_WINDOW`, a real-margin problem, not a code defect.
- [ ] The operator has cleared calendar time meaningfully longer than the 15-minute cap — no other task competing for attention during the window.

## C. Machine posture immediately before arming

- [ ] `node live_executor.js --status` shows `executionMode: PIPELINE_DRY_RUN`, `dryRunMode: true`, `liveArmed: false`.
- [ ] `.env` `SOLANA_SIGNER_SECRET` — confirm present only if this is the intentional, freshly-placed value for this session (per `SIGNER SECRET PLACEMENT EXECUTION/PLANNING`), not a stale leftover. If absent and this session needs it, follow that document's placement procedure at the correct step, not before.
- [ ] `live_positions.json` is `[]`.
- [ ] `pending_reconciliation.jsonl` absent or empty.
- [ ] `panic_events.jsonl` latest entry (if any) is a clean, reset, historical `PANIC`→`RESET` pair — not an open panic.
- [ ] `execution_audit.jsonl` reviewed for any `liveArmed:true` rows since the last real executor restart, and each one accounted for (real vs. synthetic test-harness row — see the F4 disposition doc's note on this exact ambiguity).
- [ ] Only one executor process is running (`executor_singleton.lock.json` heartbeat current, single PID) — no second Ori/Codex/Cursor session concurrently touching arming gates. This exact multi-agent-coordination risk was flagged directly in the 2026-07-11 posture log and is not hypothetical.
- [ ] `npm test` (safety suite) and `npm run test:armed-preflight-unit` / `test:armed-preflight-regression` / `test:armed-continuum-integration` / `test:armed-continuum-timing` / `test:armed-continuum-events` / `test:armed-continuum-rollback` / `test:armed-g1-proof-day` / `test:f4-adapters` / `test:armed-continuum-gap-coverage` all green, run fresh on the machine that will actually execute (not just in a sandboxed review session without real network/RPC access).
- [ ] `npm run verify:f4-adapter-boundary` clean.
- [ ] `npm run governance:verify` clean (no drift against the last checkpoint manifest).

## D. During the armed window (reference only — the orchestrator enforces this itself)

- [ ] One process, one invocation, `--dry-rehearsal` deliberately **not** passed (that flag is what keeps every test and rehearsal in this document safe; removing it is the actual arming action).
- [ ] No retries — the orchestrator already fails closed on AP/N6 retry attempts (`invocationCounts.ap > 0` / `.n6 > 0`) and duplicate continuum invocation (same `sessionId:continuumRunId`).
- [ ] No chat handoff mid-window — if the session needs to pause, that itself should be treated as a reason to let it fail closed and roll back, not resume later.

## E. After the window, regardless of outcome

- [ ] Confirm disarmed posture again (repeat section C).
- [ ] File the closure record (PASS or fail-closed) in `Sessions/` and `Authorizations/README.md` / `Decisions/` per the established pattern from AP01/AP02/AP03 closures.
- [ ] Take a fresh governance checkpoint (`npm run governance:checkpoint`) so the closure evidence itself is hash-chained.
- [ ] Mark the session's G1–G4 fingerprints "do not reuse" in the index, the same way AP01/AP02/AP03 are marked today.

**This checklist is not itself a gate and grants no authorization.** Every unchecked box above is either a human decision, a signed document, or a fresh machine reading — none of it is something this checklist (or any AI session) can check off on the operator's behalf.

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 Armed Continuum Pre-Arming Checklist — 2026-07-11.md`
