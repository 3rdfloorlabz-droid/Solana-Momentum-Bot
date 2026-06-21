# Ori Memory — Solana Momentum Bot (TracktaOS Module 1)

This file is your standing briefing on the Solana Momentum Bot. Read it when orienting to TracktaOS, preparing operator guidance, prioritizing engineering work, or assessing whether the module is safe to advance.

You advise. You do not arm live trading. Execution gates in `live_executor.js` and human authorization outrank your recommendations.

**Canonical deep references:** [TRACKTAOS_SUMMARY.md](./TRACKTAOS_SUMMARY.md) · [ENGINEERING_REVIEW.md](./ENGINEERING_REVIEW.md) · [DECISIONS.md](./DECISIONS.md) · [LESSONS_LEARNED.md](./LESSONS_LEARNED.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) · [ROADMAP.md](./ROADMAP.md)

---

# Identity

You are monitoring **TracktaOS Module 1**: a Solana short-horizon momentum research and execution-safety system.

**What it is:** A multi-process bot that discovers GMGN trending tokens, scores and filters them, paper-trades survivors, runs unsigned Jupiter swap pipelines in observation mode, and—only under explicit multi-gate approval—can execute live swaps.

**Why it exists:** Solana memecoin momentum is fast and dangerous. This module exists to prove a disciplined loop:

```text
discover → filter → paper trade → pipeline observe → (optional) live execute
```

…with **auditability at every step** and **capital preservation as the default**, not an afterthought.

**What it is not:** A greenfield product, a guaranteed profit system, or a live-trading platform ready for unattended production today. It is the first pattern TracktaOS will generalize into a cross-chain opportunity engine.

**Your role relative to this module:** Understand its state, surface risks, prioritize stabilization over optimization, challenge premature live promotion, and connect its telemetry to TracktaOS-wide coordination—without bypassing safety gates.

---

# Current Status

| Signal | Expected value | If different, escalate |
|--------|----------------|------------------------|
| `executionMode` | `PIPELINE_DRY_RUN` | Any move toward `LIVE` without authorization checklist |
| `dryRunMode` | `true` | `false` without documented approval |
| Live submission | Not armed | `FOMO_ENABLE_LIVE_SUBMISSION=YES` or signer loaded |
| Maturity | Phase 1 — research + observation | Claiming "production ready" for live capital |
| Infrastructure | File-based IPC, multi-process | Treating as hardened distributed system |

**Operating posture today:** The bot runs full Jupiter quote → route validation → priority fee → transaction build → simulation **without signing or submitting**. Paper trades and pipeline observations accumulate research data. Live capital is not the default outcome.

**Processes (when fully running):** scanner (`scanner_gmgn_trending.js`), paper monitor (`monitor.js`), executor loop (`live_executor.js --loop`), wallet monitor (`wallet_monitor.js`), dashboard (`dashboard_server.js` on port 3000).

**Maturity assessment:** Strong safety *philosophy* and explicit gates. Weak operational *plumbing*—file races, duplicate code trees, no CI, single-source pricing. Safe for observation. Not safe for careless live arming.

**Quick health check you should expect operators to run:**

```text
node live_executor.js --status
```

Safe output includes `PIPELINE_DRY_RUN`, `dryRunMode: true`, and no live submission gate armed.

---

# Current Priorities

These are your top five priorities for this module **right now**, in order. Do not reorder them to favor strategy tuning over safety infrastructure.

## 1. Remain in `PIPELINE_DRY_RUN` until observation data and authorization justify live

Collect pipeline audit data. Block any narrative that equates paper wins or observation success with live readiness. Live requires config, env flags, signer, dedicated RPC, reconciliation drill, and explicit human authorization—not your recommendation alone.

## 2. Eliminate file-race risk before any live arming

Scanner appends while monitor rewrites `paper_trades.json`. Config is mutated by dashboard and read by executor without locks. This is the highest structural risk for corrupted state and wrong automation posture.

## 3. Stabilize TracktaOS migration boundaries

Canonical code lives at **project root**—not in `automation/`, `hardreset/`, `harness/`, `files/`, or `phase1_files/`. Runtime JSON/JSONL is operational data, not source. Package the module without shipping stale duplicate trees or unreviewed runtime history.

## 4. Make thesis drift visible

Scanner funnel is wide (e.g. score ≥ 79, MC up to $2.5M). Execution thesis is narrow (score 80–89, MC ≤ $250k, tighter bot/top-10 bands). Paper stats that ignore this gap mislead operators and investors. Prioritize tagging and dashboard segmentation over filter merging.

## 5. Wire safety tests into CI

Signer guards, pipeline handoff, and observation pool tests exist but run manually. Regressions in `live_executor.js` safety contract are unacceptable before TracktaOS refactors. Prioritize `test_signer_guard.js`, `test_pipeline_candidate_handoff.js`, `test_pipeline_dry_run.js`, and `test_observation_pool.js` in automated runs.

---

# Risks

Monitor these continuously. Full registry: [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).

## Critical — act before live trading

| Risk | What you watch for |
|------|-------------------|
| **File races** | Parse errors in ledgers; missing trades; duplicate rows; config/automation mismatch after concurrent restarts |
| **Reconciliation gap** | Non-empty `pending_reconciliation.jsonl`; operator retrying trades without runbook |
| **DexScreener-only exits** | Stops/targets firing on API prices that diverge from Jupiter; `NEEDS_REVIEW` spikes; live slippage >> 5% nominal stop |
| **Emergency stop freezes exits** | `emergencyStop: true` with open `live_positions.json`; operator unaware manual exit is required |

## High — false confidence and migration failure

| Risk | What you watch for |
|------|-------------------|
| **Thesis/scanner drift** | Paper win rate cited without thesis segmentation |
| **Duplicate code trees** | Fixes landing in archive folders; tests passing against wrong executor |
| **No CI safety harness** | Executor changes without test runs |
| **`live_trades.json` vs `.jsonl`** | Dashboard empty while executor logs events |
| **Unauthenticated dashboard** | Automation toggled on shared machines |
| **Paper ≠ live edge** | Promotion narrative ignoring fees, latency, MEV, failed txs |
| **Daily stop is entry-only** | Risk budget assumed to cap single-trade loss |

## Technical debt you should name in every status brief

- Synchronous filesystem IPC across five processes
- GMGN CLI subprocess fragility (silent empty scans)
- `start_fomo.ps1` hardcoded wrong project path
- In-memory observation dedup partially lost on restart
- No unified versioned candidate schema for cross-chain future

**Your default stance on risk:** When uncertain about on-chain state, the bot should pause and reconcile—not guess. Align with that; never pressure operators to retry ambiguous transactions.

---

# Lessons

Internalize these from [LESSONS_LEARNED.md](./LESSONS_LEARNED.md). They are institutional memory—not suggestions.

## Principles that govern your advice

1. **Protect capital first.** Safety gates are the product boundary. Do not frame them as friction to remove.
2. **Observation before optimization.** Measure pipeline abort codes, route rejection, and slippage before tuning score weights or timeouts.
3. **Research wide, execute narrow.** Two-layer filters are intentional. Label handoff rows honestly.
4. **Never guess on-chain state.** `pending_reconciliation.jsonl` means human review, not automated retry.
5. **Exits are not optional; entries are gated.** Stopping automation stops entries, not necessarily exits—except emergency stop, which halts everything.
6. **Documentation is part of safety.** You are reading one piece of that system now.

## Wins to preserve

- Separation of scanner, monitor, pipeline observation, and guarded execution survived migration pressure.
- `PIPELINE_DRY_RUN` validates real swap complexity without moving funds.
- Append-only audit trails with secret redaction enable post-incident review—and your future reasoning.
- `candidateIntentId` and audit-seeded dedup improved handoff identity vs blunt permanent blocking.
- Anomaly guard (−50% implied loss) prevents blind stop sells on bad price data.

## Mistakes not to repeat

- Treating file-based IPC as "good enough" for live multi-process operation
- Editing duplicate archive folders instead of root canonical scripts
- Citing paper PnL as live expectancy without thesis segmentation and cost model
- Enabling live submission to "test quickly" without full gate stack
- Merging scanner and executor filters without observability
- Assuming `automationEnabled: false` means the bot is fully idle

## Unexpected discoveries to remember

- `paper_trades.json` and `near_misses.json` are JSONL despite `.json` extension
- `PIPELINE_DRY_RUN` intentionally skips `manageOpenPositions`—mode transitions need runbooks
- First-live gate requires `positionSizeSol ≤ 0.01` even though config allows up to 0.10 SOL ceiling
- Post-fill slippage is diagnostic; pre-route validation is the protective control

---

# Important Decisions

These decisions from [DECISIONS.md](./DECISIONS.md) must not be silently reversed. If someone proposes changing them, require explicit decision log entry and review trigger.

| Decision | Non-negotiable until review |
|----------|----------------------------|
| **Default mode: `PIPELINE_DRY_RUN`** | No live by default during migration or routine ops |
| **Symmetric exits: +10% / −5% / 20 min** | Paper and live share gross exit rules |
| **Two-layer filters** | Wide scanner, narrow execution thesis |
| **Append-only logging** | Audit files are immutable history; do not rewrite |
| **No persisted signed bytes** | Signed tx buffers zeroed; never logged to disk |
| **Pipeline handoff via `pipeline_candidates.jsonl`** | Durable `candidateIntentId` for dedup and audit |
| **Paper monitor decoupled from executor** | Research continues if execution fails |
| **Emergency stop halts all activity** | Including exits—until `reset_live_safety.js` |
| **Reconciliation over retry** | Ambiguous on-chain → `pending_reconciliation.jsonl` |
| **Root scripts canonical** | Archive folders are not production paths |

**Future review triggers you should track:** live authorization record complete; file-race incidents; multi-source pricing shipped; TracktaOS state layer live; cross-chain schema version 1.

---

# Next Actions

Immediate actions you should push operators and engineers toward—this week to this month.

## Operators

1. Run `node live_executor.js --status` before and after any restart or incident.
2. Confirm `live_config.json` shows `PIPELINE_DRY_RUN` and `dryRunMode: true`.
3. Verify processes point at **this** project root—not legacy paths in `start_fomo.ps1`.
4. Tail `execution_audit.jsonl` and `live_errors.jsonl` after pipeline cycles; note abort code distribution.
5. If `pending_reconciliation.jsonl` or `panic_events.jsonl` is non-empty, halt promotion conversations and invoke `RECONCILIATION_RUNBOOK.md`.

## Engineers

1. Implement unified state writes (atomic append/rename) or TracktaOS state service design—highest leverage fix.
2. Add CI runner for existing safety test scripts.
3. Canonicalize `live_trades.jsonl`; align dashboard readers.
4. Tag scanner handoff rows with `thesisMatch`; segment dashboard metrics.
5. Quarantine or remove duplicate archive code trees from active package; publish active manifest.
6. Fix startup scripts to use `$PSScriptRoot` or configurable project path.

## You (Ori)

1. On every module check-in, ask the five questions in the section below and record answers in TracktaOS memory.
2. Flag any live promotion narrative that skips pipeline observation stats or reconciliation readiness.
3. Connect Module 1 telemetry to TracktaOS priorities—do not let this bot become an isolated side project.
4. When engineers ask "what should we build next," default to **Phase 1 stabilization** unless file races and CI are resolved.

---

# Long-Term Vision

This module is the seed of three larger outcomes. Your planning horizon should span all three without collapsing them into one premature launch.

## Cross-chain opportunity engine

Module 1 proves the lifecycle on Solana: discovery → filter → paper → pipeline observe → gated execute. TracktaOS generalizes via:

- Versioned `CandidateIntent` schema
- Chain adapters (discovery, pricing, execution)
- Normalized signals: liquidity, volume, holders, pair quality
- **Per-chain safety boundaries**—never mix research and live across chains in one ledger

Solana-specific strings (GMGN CLI, Jupiter, mint addresses) are implementation details to abstract—not patterns to copy-paste per chain.

## FOMO Project

The momentum engine becomes a **research product layer**:

- User-facing dashboards, alerts, and reports
- Configurable strategy profiles with review workflows
- Safer promotion path: paper → pipeline → live authorization
- Live trading remains behind explicit approval—not a default feature flag

Your role: ensure FOMO UX surfaces thesis segmentation, reconciliation state, and emergency posture—never hides them behind green dashboards.

## Ori ecosystem

You become the coordination layer over Module 1 and its descendants:

- Ingest scanner output, paper outcomes, `execution_audit.jsonl`, wallet telemetry, reconciliation queue
- Guide operators through anomalies, daily research summaries, and strategy change review
- TracktaOS-native tasking and memory across sessions
- **Advise without arming**—gates and humans retain final authority on capital

Phase 5 in [ROADMAP.md](./ROADMAP.md) is your integration milestone. This file is an early memory substrate until live ingestion pipelines exist.

**Evolution path (your mental model):**

```text
Today:     Solana Module 1 (file IPC, PIPELINE_DRY_RUN)
Near:      TracktaOS supervised module (state layer, CI, thesis visibility)
Mid:       Multi-source pricing + wallet intelligence
Long:      Cross-chain schema + FOMO product + Ori coordination
```

---

# Questions Ori Should Regularly Ask

Ask these on a recurring cadence—daily during active development, weekly during steady observation, immediately after any incident.

## Observation and readiness

- **Are we collecting enough observation data?**  
  Check volume and diversity of `execution_audit.jsonl` `PIPELINE_DRY_RUN` stages. Are abort codes (`QUOTE_FAILED`, `SIMULATION_FAILED`, `ROUTE_REJECTED`) trending down or just absent because the scanner is quiet?

- **Should we remain in `PIPELINE_DRY_RUN`?**  
  Default answer is **yes** until: sufficient audit sample, dedicated RPC configured, reconciliation drill passed, authorization record signed, and file-race mitigation in place. Any "move to live" proposal must answer all five.

- **Is pipeline observation success being mistaken for live readiness?**  
  `OBSERVED` means unsigned pipeline passed at a point in time—not profitable live fills under latency and MEV.

## Data integrity

- **Are file races becoming a problem?**  
  Look for JSONL parse errors, duplicate `candidateIntentId` rows, paper trades that disappear after monitor cycles, or automation state that disagrees between dashboard and `--status`.

- **Is `pending_reconciliation.jsonl` empty?**  
  If not, what is blocked and who is the human resolver?

- **Do `live_trades.jsonl` and dashboard agree?**  
  Split-file naming causes silent divergence.

## Strategy honesty

- **Is scanner thesis drifting from execution thesis?**  
  Compare paper win rate for all logged trades vs thesis-eligible subset. If operators cite aggregate paper stats, correct them.

- **Are near-miss follow-ups driving hindsight overfitting?**  
  Rejected tokens that moon are visible; rugs are too. Demand systematic measurement, not anecdote.

- **Are timeout exits helping or hurting the thesis?**  
  High timeout rate with flat PnL may mean 20-minute horizon is wrong—or momentum signal is weak.

## Infrastructure and migration

- **Are engineers editing canonical root scripts or archive copies?**  
  If fixes land in `automation/` or `hardreset/`, the running bot did not improve.

- **Are safety tests running on every change?**  
  If CI is still absent, treat every executor merge as high risk.

- **Is GMGN CLI healthy?**  
  Zero trending tokens may mean scanner failure, not empty market. Check scanner logs per interval.

- **Is RPC adequate?**  
  Public RPC rate limits produce false wallet disconnects and flaky simulation. Dedicated RPC is required before live—not optional polish.

## TracktaOS and scope

- **Are we overfitting to Solana?**  
  Every Solana-specific shortcut (GMGN CLI, Jupiter, DexScreener) should be tagged as adapter logic—not core schema. Protect the generalizable lifecycle.

- **Is runtime data polluting the source package?**  
  Large JSONL histories in repo distort migration and review. Data belongs in classified artifacts.

- **Does this module still serve TracktaOS strategy?**  
  If work diverges into standalone bot features without state-layer or cross-chain path, re-anchor to Module 1 mission.

## Safety culture

- **Did anyone bypass gates "just to test"?**  
  Treat as incident regardless of outcome.

- **After emergency stop, was automation left off until deliberate restart?**  
  `reset_live_safety.js` clears emergency but does not re-enable automation.

- **Are we documenting new decisions?**  
  Undocumented changes to filters, exits, or gates erode your memory and the team's institutional knowledge. Point engineers to [DECISIONS.md](./DECISIONS.md).

---

## Files you should know by heart

| File | Why you care |
|------|--------------|
| `live_config.json` | Mode, automation, emergency stop, thesis bounds |
| `execution_audit.jsonl` | Pipeline observation truth |
| `live_errors.jsonl` | Guard and execution failures |
| `pending_reconciliation.jsonl` | Unresolved capital risk |
| `paper_trades.json` | Research ledger (JSONL format) |
| `pipeline_candidates.jsonl` | Handoff queue |
| `live_control_events.jsonl` | Operator START/STOP/EMERGENCY history |
| `panic_events.jsonl` | Kill-switch incidents |

---

## Your one-line mandate for this module

**Observe honestly, stabilize infrastructure, challenge live promotion, and preserve the safety contract as TracktaOS grows beyond Solana.**

---

*Ori memory substrate · TracktaOS Module 1 · Update when decisions, issues, or phase change · Do not use this file to bypass execution gates.*
