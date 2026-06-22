# Sprint 1 Plan — Quick Wins (Q1–Q10)

**Sprint:** 1 of 4 (Phase 1 — Understanding and Stabilization)  
**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Duration target:** 1–2 weeks  
**Operating constraint:** `PIPELINE_DRY_RUN` — no live arming, no strategy changes

**Parent plan:** [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md)  
**Ori briefing:** [ORI_MEMORY.md](./ORI_MEMORY.md)

---

# Mission

Sprint 1 establishes **operational truth** before deeper engineering.

Today, the bot can run—but operators may start the wrong processes from the wrong directory, fix the wrong code copy, trust a dashboard that reads the wrong live ledger file, and merge executor changes without automated safety regression checks. Runtime data boundaries are understood in docs but not yet fully encoded in manifest and gitignore conventions.

Sprint 1 does not fix file races (Sprint 4 / A1). It removes the **preventable foot-guns** that make every other sprint unreliable:

1. Processes launch from the correct project root
2. Engineers know which files are canonical
3. CI guards the safety contract on every change
4. Dashboard and executor agree on live event history
5. Documentation encodes mode transitions and data boundaries

**One-line mission:** Make the system **start correctly, measure honestly, and fail safely in CI**—without changing strategy or arming live trading.

---

# Success Criteria

Sprint 1 is complete when all of the following are verifiably true:

| # | Criterion | Verification |
|---|-----------|--------------|
| SC1 | `start_fomo.ps1` and `fomo_status.ps1` use repo-relative paths and fail fast if `live_config.json` is missing | Manual launch from clean shell |
| SC2 | `ACTIVE_MANIFEST.md` lists every canonical root script and explicitly excludes archive folders | Doc review + engineer sign-off |
| SC3 | README and OPERATIONS warn against editing archive trees | Doc review |
| SC4 | Dashboard reads `live_trades.jsonl` as canonical; no stale `.json`-only panel | Side-by-side compare with executor output |
| SC5 | `npm test` runs four core safety scripts and exits 0 on main | Local + CI |
| SC6 | GitHub Actions runs safety tests on pull requests to main | Green workflow on sample PR |
| SC7 | Mode transition runbook exists for `PIPELINE_DRY_RUN` → live management | Doc linked from OPERATIONS |
| SC8 | Dashboard surfaces RPC endpoint source and warns on public fallback | Visual check with/without `HELIUS_RPC_URL` |
| SC9 | Runtime JSON remains gitignored; MIGRATION_NOTES documents local-only data convention | `git status` clean; doc review |
| SC10 | `node live_executor.js --status` still shows `PIPELINE_DRY_RUN` after all changes | Post-sprint smoke check |

---

# Tasks

Tasks are ordered by recommended execution sequence. Dependencies reference task IDs (Q1–Q10).

---

## Q1 — Fix `start_fomo.ps1` project path

| Field | Detail |
|-------|--------|
| **Description** | Replace hardcoded `C:\Users\nalle\sol-momentum-bot` with `$PSScriptRoot` (or parameterized `$ProjectPath` defaulting to script directory). Validate `live_config.json` exists before launching any process. Abort with clear error if validation fails. |
| **Why it matters** | Wrong-path launches are silent failures: operators believe the bot is running while a stale or empty tree executes—or nothing runs at all. |
| **Dependencies** | None |
| **Risk level** | **Low** — ops script only; no trading logic |
| **Estimated complexity** | **S** (2–4 hours) |

**Acceptance:** All five processes start from `Solana-Momentum-Bot` root on a fresh machine path.

---

## Q2 — Align `fomo_status.ps1` with project path

| Field | Detail |
|-------|--------|
| **Description** | Apply same path resolution as Q1. Ensure status script inspects processes whose working directory matches canonical repo root. |
| **Why it matters** | Status checks must reflect reality after Q1 fix; mismatched scripts recreate confusion. |
| **Dependencies** | Q1 |
| **Risk level** | **Low** |
| **Estimated complexity** | **S** (1–2 hours) |

**Acceptance:** `fomo_status.ps1` reports running Node processes for this repo only.

---

## Q3 — Publish `ACTIVE_MANIFEST.md`

| Field | Detail |
|-------|--------|
| **Description** | Create root manifest listing canonical scripts: `scanner_gmgn_trending.js`, `monitor.js`, `live_executor.js`, `dashboard_server.js`, `wallet_monitor.js`, safety scripts, and primary config/state filenames. Explicitly list **non-canonical** archive folders: `automation/`, `hardreset/`, `harness/`, `files/`, `phase1_files/`. |
| **Why it matters** | Resolves ranked problem #4 (duplicate trees). Every engineer and Ori review starts from one source of truth. |
| **Dependencies** | None (should land early; unblocks Q4 messaging and Sprint 2 M9) |
| **Risk level** | **Low** — documentation |
| **Estimated complexity** | **S** (2–3 hours) |

**Acceptance:** New engineer can answer "which scanner do I run?" from manifest alone.

---

## Q4 — Mark archive folders in README + OPERATIONS

| Field | Detail |
|-------|--------|
| **Description** | Add prominent warnings in README and OPERATIONS: archive folders are not production paths; edits there do not affect running bot. Link to `ACTIVE_MANIFEST.md`. |
| **Why it matters** | Reinforces Q3; reduces wrong-tree fixes that pass review but never deploy. |
| **Dependencies** | Q3 |
| **Risk level** | **Low** |
| **Estimated complexity** | **S** (1 hour) |

**Acceptance:** OPERATIONS preflight checklist includes "confirm canonical path via manifest."

---

## Q5 — Canonicalize dashboard on `live_trades.jsonl`

| Field | Detail |
|-------|--------|
| **Description** | Update `dashboard_server.js` so all live trade history panels read `live_trades.jsonl` (matching `live_executor.js` v2). Deprecate `live_trades.json` reads; optional one-time migration note if legacy file exists. Align readiness panel with executor `FILES.LIVE_TRADES_FILE`. Update `reset_live_safety.js` / `validate_live_system.js` references if inconsistent. |
| **Why it matters** | Ranked problem #5. Operators and Ori currently risk empty dashboard panels while events append elsewhere—false picture of system activity. |
| **Dependencies** | Q3 (manifest documents canonical ledger name) |
| **Risk level** | **Medium** — touches operator UI; must not alter execution behavior |
| **Estimated complexity** | **M** (4–8 hours) |

**Acceptance:** Dashboard event count matches line count of `live_trades.jsonl` after executor cycle.

---

## Q6 — Wire `npm test` to core safety scripts

| Field | Detail |
|-------|--------|
| **Description** | Replace `"test": "exit 1"` with runner invoking: `test_signer_guard.js`, `test_pipeline_candidate_handoff.js`, `test_pipeline_dry_run.js`, `test_observation_pool.js`. Fail fast on first failure; print clear pass/fail summary. |
| **Why it matters** | Ranked problem #2. Safety contract in `live_executor.js` currently relies on manual discipline—unacceptable before refactors. |
| **Dependencies** | None |
| **Risk level** | **Low** — test wiring only |
| **Estimated complexity** | **M** (3–6 hours) |

**Acceptance:** `npm test` exits 0 on clean main; exits non-zero if signer guard intentionally broken in branch.

---

## Q7 — Add GitHub Actions CI workflow

| Field | Detail |
|-------|--------|
| **Description** | Add `.github/workflows/safety-tests.yml` (or equivalent) running `npm test` on PR and push to main. Node 18+. No secrets required. |
| **Why it matters** | Makes Q6 enforceable on every merge; Ori can trust green main for safety regressions. |
| **Dependencies** | Q6 |
| **Risk level** | **Low** |
| **Estimated complexity** | **M** (2–4 hours) |

**Acceptance:** PR to main shows passing safety workflow; failing test blocks merge (if branch protection enabled).

---

## Q8 — Document mode transition runbook

| Field | Detail |
|-------|--------|
| **Description** | Add `docs/MODE_TRANSITION.md` (or section in OPERATIONS) covering: `PIPELINE_DRY_RUN` behavior (skips `manageOpenPositions`), what changes in `DRY_RUN` / `LIVE`, required checks before any mode flip, and explicit "do not flip during Sprint 1" banner. Link from STABILIZATION_PLAN and OPERATIONS. |
| **Why it matters** | Known issue: pipeline mode intentionally skips live position management. Undocumented mode flips cause false confidence and trapped positions later. |
| **Dependencies** | None |
| **Risk level** | **Low** |
| **Estimated complexity** | **S** (2–3 hours) |

**Acceptance:** Operator can answer what executor does and does not do in each mode without reading source.

---

## Q9 — Surface RPC source + public-fallback warning in dashboard

| Field | Detail |
|-------|--------|
| **Description** | Display active RPC endpoint source in wallet/RPC panel (`HELIUS_RPC_URL`, derived Helius key, `SOLANA_RPC_URL`, or public fallback). Show visible warning when public mainnet-beta fallback is in use for wallet or simulation paths. |
| **Why it matters** | Public RPC rate limits cause false "disconnected" wallet states and flaky pipeline observation—often misread as bot failure vs infrastructure limitation. |
| **Dependencies** | None |
| **Risk level** | **Low** — read-only display |
| **Estimated complexity** | **S** (3–5 hours) |

**Acceptance:** Dashboard clearly labels RPC source; warning visible when no dedicated RPC env is set.

---

## Q10 — Confirm gitignore + `data/` convention in MIGRATION_NOTES

| Field | Detail |
|-------|--------|
| **Description** | Audit `.gitignore` covers runtime artifacts (`boosts.json`, `signals.json`, `trending.json`, `live_trades.json`, backups, local ledgers). Document in MIGRATION_NOTES: runtime data stays local; optional future `data/` directory convention for TracktaOS packaging. Do **not** commit local runtime files to "clean up." |
| **Why it matters** | Preserves Phase 0 win: git history stays source-only; migration packages don't leak operational history or pollute GitHub. |
| **Dependencies** | None |
| **Risk level** | **Low** |
| **Estimated complexity** | **S** (1–2 hours) |

**Acceptance:** `git status` on dev machine shows only intentional source changes; MIGRATION_NOTES states local-data policy.

---

# Quick Wins

Highest-leverage items if time is constrained. **Minimum viable Sprint 1** = Q1 + Q3 + Q6 + Q7 + Q5.

| Priority | Task | Leverage |
|----------|------|----------|
| **1** | Q6 + Q7 — CI safety tests | Protects every future change; addresses ranked problem #2 immediately |
| **2** | Q1 + Q2 — Startup paths | Bot actually runs from correct tree; unblocks honest observation |
| **3** | Q3 + Q4 — Manifest + warnings | Stops wrong-file edits; highest ROI documentation work |
| **4** | Q5 — `live_trades.jsonl` alignment | Fixes operator/Ori blind spot on live event history |
| **5** | Q9 — RPC source visibility | Reduces false "system broken" diagnoses during dry-run |
| **6** | Q8 + Q10 — Docs + gitignore | Low effort; encodes discipline for TracktaOS migration |

**Defer last if needed:** Q8, Q10 (docs-only, no runtime dependency for other tasks).

---

# Metrics

Ori should monitor these **weekly during Sprint 1** (daily if active executor/scanner merges occur).

## Sprint 1 delivery metrics

| Metric | Target | Source |
|--------|--------|--------|
| Tasks Q1–Q10 complete | 10/10 | Sprint board / PR list |
| CI safety workflow | Green on main | GitHub Actions |
| `npm test` local pass | 100% before merge | Developer discipline |
| Wrong-path launch incidents | 0 | Operator report |

## Operational health metrics (unchanged during sprint)

| Metric | Healthy | Warning | Source |
|--------|---------|---------|--------|
| `executionMode` | `PIPELINE_DRY_RUN` | `LIVE` without checklist | `live_config.json`, `--status` |
| CI on main | Green | Red > 24h | GitHub |
| Dashboard vs `live_trades.jsonl` | Counts match | Dashboard empty, file growing | After Q5 |
| RPC panel | Dedicated RPC labeled | Public fallback warning ignored | After Q9 |
| `git status` on dev clone | Source changes only | Runtime JSON staged | After Q10 |
| JSONL parse errors | 0 | Any parse error | `validate_data.js` |
| Open reconciliation rows | 0 | Any open row | `pending_reconciliation.jsonl` |

## Questions Ori asks each Sprint 1 check-in

1. Are safety tests running on every PR yet (Q7)?
2. Did any fix land in an archive folder instead of root (Q3/Q4)?
3. Do dashboard live events match `live_trades.jsonl` (Q5)?
4. Are we still in `PIPELINE_DRY_RUN` with no signer loaded?
5. Is anyone proposing Sprint 2 work (thesis tagging) before CI is green?

---

# Things Not To Touch

Sprint 1 scope is narrow. **Do not expand sprint scope** into these areas—even if tempting.

## Safety and execution contract

| Protected area | Reason |
|----------------|--------|
| `PIPELINE_DRY_RUN` as default | Core decision; observation still accumulating |
| Live arming gates (`FOMO_ENABLE_LIVE_SUBMISSION`, signer env, etc.) | Do not simplify or bypass |
| `live_executor.js` safety contract (`loadConfig` ceilings, forbidden flags) | Only touch via tested paths; Q6/Q7 must pass |
| Signer loading and submission logic | Out of scope; high capital risk |
| Symmetric exits (+10% / −5% / 20 min) | Strategy, not stabilization |
| Two-layer filters | Do not merge scanner and executor thesis in Sprint 1 |
| −50% anomaly guard | Correct capital-preservation behavior |
| Reconciliation-over-retry | Never add auto-retry for ambiguous txSig |
| Append-only audit files | Do not rewrite historical JSONL |

## Code and data boundaries

| Protected area | Reason |
|----------------|--------|
| Archive folder **code** (`automation/`, etc.) | Document only (Q4); quarantine is Sprint 2 (M9) |
| Runtime JSON artifacts | Keep local; do not commit (`boosts.json`, backups, etc.) |
| Strategy scoring / scanner filters | Sprint 2+ after measurement infrastructure |
| Unified state layer (A1) | Sprint 4 — do not half-implement in Sprint 1 |
| `thesisMatch` tagging (M1) | Sprint 2 — depends on CI from Sprint 1 |

## Process

| Protected area | Reason |
|----------------|--------|
| Enabling `executionMode: LIVE` for experiments | Forbidden in shared env during Phase 1 |
| Parallel scanner versions | Only `scanner_gmgn_trending.js` is active |
| Compounding / martingale / multi-position | Hard-rejected in config |

**If a Sprint 1 task appears to require changing a protected area:** stop, log a DECISIONS.md entry, and escalate—do not silently widen scope.

---

# Exit Criteria

All must be satisfied before **Sprint 2** (M1–M4, M6–M8 — honest measurement) begins.

## Required (hard gates)

- [ ] **Q1–Q7 complete** — paths, manifest, dashboard ledger, CI locally and on GitHub
- [ ] **Q5 verified** — dashboard and `live_trades.jsonl` agree on event history
- [ ] **Q6 + Q7 green** — at least one merged PR exercised CI successfully
- [ ] **SC10** — post-sprint `--status` shows `PIPELINE_DRY_RUN`, no live gate armed
- [ ] **KNOWN_ISSUES.md updated** — mark resolved or in-progress: startup path, CI gap, `live_trades.json`/`.jsonl` split (if fully fixed)
- [ ] **No open Sprint 1 regressions** — safety tests pass; no new critical issues introduced

## Recommended (soft gates)

- [ ] **Q8 complete** — mode transition runbook published
- [ ] **Q9 complete** — RPC source visible in dashboard
- [ ] **Q10 complete** — gitignore audit + MIGRATION_NOTES data convention
- [ ] **Ori sign-off** — weekly metrics reviewed; no live promotion narrative bypassing CI requirement

## Explicitly not required for Sprint 2 entry

- File race fix (A1) — Sprint 4
- `thesisMatch` tagging — Sprint 2 work, not Sprint 1 exit
- Archive folder physical quarantine (M9) — Sprint 3
- Dedicated RPC mandatory enforcement — Sprint 3 (A4)
- Multi-source pricing — pre-live / later sprint

## Sprint 2 preview (do not start until exit criteria met)

| Next | Focus |
|------|--------|
| M1 | Persist `thesisMatch` on handoff rows |
| M2 | Dashboard thesis-segmented stats |
| M3 | Persist observation dedup cooldown |
| M4 | Scanner health metrics |
| M6 | Reconciliation dashboard panel |
| M7–M8 | `liveArmed` status + promotion checklist |

---

## Task dependency diagram

```text
Q3 ──► Q4
Q1 ──► Q2

Q3 ──► Q5

Q6 ──► Q7

Q8, Q9, Q10 — independent (parallel)
```

**Suggested parallel tracks:**

- **Track A (Ops):** Q1 → Q2 → Q9  
- **Track B (Docs):** Q3 → Q4 → Q8 → Q10  
- **Track C (Eng):** Q6 → Q7 → Q5  

---

## Related documents

- [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) — full Phase 1 plan
- [ORI_MEMORY.md](./ORI_MEMORY.md) — priorities and review questions
- [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) — issue registry to update on completion
- [DECISIONS.md](./DECISIONS.md) — log any scope or safety exceptions
- [OPERATIONS.md](./OPERATIONS.md) — update with manifest and path checks

---

*Sprint 1 · Quick Wins Q1–Q10 · TracktaOS Module 1 · Phase 1 Stabilization*
