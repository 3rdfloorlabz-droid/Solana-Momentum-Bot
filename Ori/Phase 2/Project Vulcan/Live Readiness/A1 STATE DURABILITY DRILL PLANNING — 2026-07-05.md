# A1 State Durability Drill Planning — 2026-07-05

Status:
**Planning complete — no runtime, no drills executed, no readiness claim**

Gate type:
Doc-only A1 state durability drill plan

Prerequisite:
`A1 STATE DURABILITY PRE-LIVE GAP REVIEW — 2026-07-05.md`

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Runtime processes started:** **No** · **Drills executed:** **No**

Credit conservation:
No observation, no drills, no crash tests in this gate. Defines the **smallest safe future drill/evidence path** only.

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `A1 STATE DURABILITY PRE-LIVE GAP REVIEW — 2026-07-05.md` | Gap classification; A1-G1–G7 blockers |
| `docs/STATE_DURABILITY_AND_LIVE_READINESS_GAP_REVIEW.md` | A1/A2/R3/R4 context; recovery deferred |
| `docs/A1D_STABILITY_OBSERVATION_PLAN.md` | A1d V1–V10 matrix; evidence backfill target |
| `docs/A1_REVIEW.md` | Shipped A1a–c scope; residual R5/R6 debt |
| `ACTIVE_MANIFEST.md` | Ownership contract, singleton lock TTL, reconciliation/recovery file roles |

---

## 2. Executive Summary

A1 **implementation on the critical path is shipped** (A1a–c, R3, R4, R5 singleton). LR-05 remains open due to:

1. **Evidence gap** — A1d 24h V1–V10 not executed  
2. **Drill gap** — stop/restart, lock, crash, reconciliation, idempotency drills not performed  

This plan defines **nine drills (A1-D01–A1-D09)** plus a **deferred A1d evidence backfill track (A1-EV1)**. Each drill maps to a **future single-purpose execution gate**. Nothing runs in this gate.

**LR-05 status after this gate:** **PARTIAL — PLANNED** (drills defined; execution deferred).

---

## 3. Drill Execution Classes

| Class | Meaning | When |
|-------|---------|------|
| **DOC** | Review/plan only — no runtime | Now or any doc gate |
| **DRY** | Dry-run execution later — `PIPELINE_DRY_RUN`, no capital | Separate authorized drill gate |
| **CRASH** | Controlled interruption later — kill process mid-cycle | Separate authorized drill gate; short window |
| **SIM** | Harness/simulation only — no real submit | Pre-arming review gate |

---

## 4. Drill Matrix

| Drill ID | Drill name | Purpose | Preconditions | Procedure summary | Evidence artifacts | Pass criteria | Fail/abort criteria | Risk if skipped | Future execution gate | Class |
|----------|------------|---------|---------------|-------------------|-------------------|---------------|---------------------|-----------------|----------------------|-------|
| **A1-D01** | Clean stop/restart recovery | Prove graceful stop leaves parseable state and restart acquires lock cleanly | E1: `dryRunMode true`, `liveArmed false`; E2: safety suite green; E3: no `recovery_actions.jsonl`; E4: Taylor authorizes short drill window | Start scanner + monitor + executor `--loop` briefly; capture baselines; graceful stop (orchestrator or `stop_fomo.ps1`); verify no `--loop` remains; wait ≤3 min for lock TTL; optional restart; re-check `--status` + parse sweep | Ori drill receipt; `--status` before/after; `Get-Process` proof; lock file before/after; JSON parse sweep; checkpoint JSONL optional | All authoritative JSON parse; posture unchanged; no persistent `*.tmp`; lock absent or stale-only after stop; restart acquires lock if run | Posture drift; torn JSON; persistent temp; dual `--loop`; unexpected `recovery_actions.jsonl` | Orphan state or wrong restart assumptions before arming | **A1-D01 Clean Stop/Restart Drill Execution** | DRY |
| **A1-D02** | Stale singleton lock recovery | Prove orphan lock after dead PID is hygiene-only and TTL/ manual cleanup is safe | E1–E3 as D01; E4: confirm no live `--loop` before any lock delete | Induce or use existing orphan lock (dead pid); verify `isExecutorLockStale`; confirm no active loop; document TTL wait vs manual delete after pid check; attempt `--loop` start only in drill gate | Lock JSON (pid, updatedAt); process list; runtime-health classification; manifest hygiene note | Lock classified stale; no active execution; new loop acquires fresh lock; no state corruption | Lock deleted while loop running; start with live pid mismatch ignored; capital posture change | False "executor running" blocks or unsafe lock deletion | **A1-D02 Stale Lock Recovery Drill Execution** | DRY |
| **A1-D03** | Crash/interruption recovery | Prove mid-cycle kill does not leave torn atomic stores | E1–E3; E4: Taylor authorizes **≤30 min** crash drill; backup posture snapshot | Run executor `--loop` + monitor; `Stop-Process -Force` on executor mid-cycle; inspect `*.tmp`, config, dedup, live_positions, paper stores; wait TTL; restart; parse sweep | Before/after file hashes or parse logs; temp file listing; `stateIntegrity`-style check | No persistent `*.tmp`; all atomic stores parse; dedup/positions not truncated; posture dry-run | Any authoritative file unparseable; persistent temp; dedup/positions array torn | Capital loss from corrupted live positions on future arming | **A1-D03 Crash/Interruption Drill Execution** | CRASH |
| **A1-D04** | Reconciliation after interrupted dry-run cycle | Prove `pending_reconciliation.jsonl` stable and reconciliation panel honest after interrupt | E1–E3; E4: baseline line count on `pending_reconciliation.jsonl` (0 if absent) | Run short dry-run cycle; optional simulated ambiguous outcome fixture if available; interrupt cycle; verify reconciliation file growth is explainable not corruption-driven | Line counts; dashboard reconciliation panel capture; parse per-line JSONL | No unexpected growth vs baseline; each line valid JSON; no corruption attributed to interrupt | Unexplained growth; parse errors; dashboard mismatch | Silent ambiguous outcomes before live fills | **A1-D04 Reconciliation Interrupt Drill Execution** | DRY |
| **A1-D05** | Audit durability / JSONL append integrity | Prove append-only ledgers remain valid under concurrent operation | E1–E3; E4: concurrent scanner + monitor + executor for short window | Capture line counts / tail hashes for `execution_audit.jsonl`, `paper_trades.json`, `config_change_audit.jsonl`; run ~1–2h or reuse future observation tail; re-verify append-only monotonicity | Line count series; tail sample; parse-all-lines script output | Monotonic append; no line corruption; no rewrite of `paper_trades` prefix; audit parse 0 errors | Line count decrease; prefix change; parse errors | Lost audit trail or undetected tampering | **A1-D05 Audit Durability Drill Execution** | DRY |
| **A1-D06** | Snapshot read-during-write residual risk | Document tolerance for `wallet_status.json` / `rpc_health.json` snapshot reads | E1: doc review complete (this plan) | Read manifest + A1d §10; during optional D01/D05 run, attempt read while wallet monitor writes; catch parse failures; record frequency | Parse attempt log; reader retry behavior note | Readers tolerate occasional parse retry OR failures are rare and non-fatal | Dashboard/executor crash on snapshot read; silent wrong balance used for **live** decision | Wrong RPC/wallet read at live arming | **A1-D06 Snapshot Read-During-Write Review** | DOC → optional DRY |
| **A1-D07** | Duplicate / observation idempotency | Prove `observation_dedup.json` prevents duplicate observation keys under loop restarts | E1–E3; E5: `test_observation_dedup_atomic.js` green | Short `--loop` run; stop; restart; verify dedup keys stable; no duplicate pipeline intents for same pair window | `observation_dedup.json` before/after; execution audit duplicate check | Dedup file valid; no duplicate observation storm; store atomic | Dedup corruption; unbounded duplicate events | Observation spam / duplicate dry-run intents → live duplicate submit risk | **A1-D07 Observation Idempotency Drill Execution** | DRY |
| **A1-D08** | `recovery_actions.jsonl` handling | Prove file absent in normal ops; simulated recovery audit append works only in approved path | E1: absent in prod root; E2: review `recovery_audit.js` + A2 allowlist | DOC: confirm dashboard preview does not write; optional SIM: run `test_recovery_audit.js` / fake harness only (temp fixtures) — **not production root** | `Test-Path recovery_actions.jsonl`; test output; A2 allowlist review | Prod root absent unless approved action; temp tests pass; no dashboard auto-write | Unexpected prod `recovery_actions.jsonl`; unauthorized append | Unauthorized recovery audit or hidden recovery execution | **A1-D08 Recovery Actions Policy Review** | DOC (+ SIM in CI) |
| **A1-D09** | Live-path idempotency simulation review | Prove duplicate submit prevention design before arming | E1: R10 harness exists; E2: `signer_simulation_harness.js` green | DOC review of R10 outputs + `test_signer_guard.js`; confirm duplicate submit blocked in simulation; no real signer | `analysis/signer_simulation_output.json`; test logs | Simulation shows duplicate block; guards green | Simulation allows double submit; guard regression | Double live submission | **A1-D09 Live-Path Idempotency Simulation Review** | SIM |

---

## 5. Deferred A1d Evidence Backfill Plan (A1-EV1)

| Item | Status / plan |
|------|---------------|
| **A1d 24h V1–V10** | **Not executed** — remains primary evidence gap (A1-G1, A1-G2) |
| **Run now?** | **No** — Taylor credit conservation; conflicts with no-observation direction |
| **Substitute?** | B2A 12h accepted for **process/control only** — **does not** satisfy A1d §8 |
| **Future gate** | **A1d Stability Observation Execution** — separate Taylor authorization required |
| **Minimum scope when authorized** | Full 24h per `docs/A1D_STABILITY_OBSERVATION_PLAN.md`: V1–V10 checkpoints, append-only prefix proof, config SHA series, temp hygiene, reconciliation baseline, parse sweep |
| **Credit note** | May overlap with passive market hours but is still a **dedicated 24h window** — not combined with B2A/R7b strategy collection without explicit scope amendment |
| **Partial backfill option** | If Taylor later authorizes **shorter** evidence only, must be labeled `NOT_FULL_A1D` and cannot close A1-G1 without residual-risk acceptance (§7) |

**This gate does not authorize A1-EV1.**

---

## 6. Drill Scheduling Priority (Future — Not Now)

Ordered for **minimum risk / minimum runtime** when Taylor authorizes drills:

| Priority | Drill | Rationale |
|----------|-------|-----------|
| 1 | **A1-D08** Recovery actions policy | DOC only — zero runtime |
| 2 | **A1-D09** Live-path idempotency simulation | SIM / existing tests — zero prod runtime |
| 3 | **A1-D06** Snapshot read-during-write | DOC first; optional short DRY |
| 4 | **A1-D01** Clean stop/restart | Short DRY; builds on B2A 12h stop evidence |
| 5 | **A1-D02** Stale lock recovery | Short DRY; extends B2A orphan lock finding |
| 6 | **A1-D07** Observation idempotency | Short DRY |
| 7 | **A1-D05** Audit durability | Medium DRY (~1–2h) |
| 8 | **A1-D04** Reconciliation interrupt | DRY; may need market activity |
| 9 | **A1-D03** Crash/interruption | CRASH — highest care; short window |
| 10 | **A1-EV1** A1d 24h | Longest runtime — separate authorization |

---

## 7. Residual-Risk Acceptance Criteria

### Tier A — May accept for **micro-live planning** (doc track only; not arming)

| Risk | Acceptance condition |
|------|----------------------|
| A1d 24h not complete | Taylor documents **NOT_FULL_A1D** + B2A 12h + planned drill path |
| R6 JSONL interleave | Single-writer discipline + audit drills planned; no observed corruption |
| Snapshot read-during-write | Readers fail-closed or retry; not used as live submit gate without D06 review |
| R7b sample insufficient | Already assessed; R13 waiver path separate |

**Tier A does not authorize arming or capital.**

### Tier B — Must be **drilled or SIM-reviewed** before any **arming gate** (step 7)

| Requirement | Drill |
|-------------|-------|
| Clean stop/restart | A1-D01 |
| Stale lock hygiene | A1-D02 |
| Crash/interruption atomic stores | A1-D03 |
| Reconciliation stability | A1-D04 |
| Audit append integrity | A1-D05 (or A1-EV1 V1/V10 subset) |
| Observation idempotency | A1-D07 |
| Live duplicate submit prevention | A1-D09 |
| Recovery actions policy | A1-D08 |

### Tier C — **Blocks capital exposure entirely** until closed

| Blocker | Why |
|---------|-----|
| Torn `live_positions.json` or `observation_dedup.json` after drill | Direct capital/state corruption risk |
| Persistent `*.tmp` across checkpoints | Atomic write failure |
| Posture drift (`liveArmed true`, `dryRunMode false`) during drill | Safety violation |
| Unexpected prod `recovery_actions.jsonl` | Unauthorized recovery surface |
| A1-D09 simulation regression (double submit allowed) | Live idempotency failure |
| R13 not signed | No human authorization |
| LR-04 live submission path not reviewed | Signer/RPC/submit gates |

---

## 8. Drills: Deferred vs Required Before Arming

| Drill / track | Status now | Required before arming? |
|---------------|------------|-------------------------|
| A1-D01 Clean stop/restart | **Deferred** | **Yes** |
| A1-D02 Stale lock | **Deferred** | **Yes** |
| A1-D03 Crash/interruption | **Deferred** | **Yes** |
| A1-D04 Reconciliation interrupt | **Deferred** | **Yes** |
| A1-D05 Audit durability | **Deferred** | **Yes** (or A1-EV1 V1/V10 equivalent) |
| A1-D06 Snapshot RDW | **DOC review in plan**; optional DRY deferred | **Yes** (DOC minimum; DRY if anomalies) |
| A1-D07 Observation idempotency | **Deferred** | **Yes** |
| A1-D08 Recovery actions | **DOC reviewable now**; prod drill N/A | **Yes** (policy review) |
| A1-D09 Live idempotency SIM | **Deferred execution review** | **Yes** |
| A1-EV1 A1d 24h | **Deferred** | **Recommended**; waivable only with Tier A Taylor acceptance — **not waived in this gate** |

---

## 9. What Can Be Done Without Runtime (This Track)

| Item | Gate type |
|------|-----------|
| A1-D08 recovery actions policy | Doc review in **A1-D08 Recovery Actions Policy Review** |
| A1-D09 simulation artifacts | Doc review in **A1-D09 Live-Path Idempotency Simulation Review** |
| A1-D06 snapshot risk | Doc review in **A1-D06 Snapshot Read-During-Write Review** |
| R14 slippage/MEV policy | Doc review — parallel authorization step 3 |
| Micro-live runbook gaps | Doc review — LR-08 |

**No drill execution gate is authorized by this document.**

---

## 10. LR-05 / Authorization Sequence Update

| Step | Item | After this gate |
|------|------|-----------------|
| 2 | State durability decision | **Still open** — drills **planned**, not executed |
| Planning artifact | A1 drill matrix | **Complete** |
| Next runtime when authorized | A1-D08/D09/D06 doc reviews OR A1-D01 short DRY | Taylor **A1 Drill Authorization Decision** gate |

---

## 11. Explicit Non-Actions

| Non-action | Confirmed |
|------------|-----------|
| Run any drill | **No** |
| Start scanner/executor loops | **No** |
| Start observation / A1d 24h | **No** |
| Crash/kill processes | **No** |
| Modify `.env` / arm live | **No** |
| Promote OR-20260630-008 | **No** |
| Claim live readiness | **No** |

---

## 12. Recommended Next Gate

**R14 Slippage/MEV Policy Review**

Doc/review only — authorization sequence step 3; advances live-readiness planning without runtime; A1 drill **execution** deferred until Taylor **A1 Drill Authorization Decision** (future).

---

## 13. Safety Confirmation

| Item | Value |
|------|-------|
| `.env` opened | **No** |
| Secrets inspected | **No** |
| `process.env` dumped | **No** |
| Code changed | **No** |
| Runtime processes started | **No** |
| Drills executed | **No** |
| OR-20260630-008 status | **not_promoted** |
| Promotion authorized | **No** |
| Live readiness claimed | **No** |
| Human soak readiness claimed | **No** |
| Capital exposure enabled | **No** |

---

**Signed / confirmed by Taylor:** Taylor Cheaney (drill planning gate, 2026-07-05)
