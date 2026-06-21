# Lessons Learned

Institutional knowledge for engineers joining the Solana Momentum Bot / TracktaOS Module 1. Derived from production-adjacent operation, migration work, and [ENGINEERING_REVIEW.md](./ENGINEERING_REVIEW.md).

This document preserves what worked, what hurt, and what we will not repeat. It complements [DECISIONS.md](./DECISIONS.md) (why we chose) and [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) (what is still broken).

---

## Wins

### Separation of concerns survived contact with reality

The split between scanner, paper monitor, pipeline dry-run, and guarded live execution held up under migration pressure. Paper monitoring continues when the executor fails to load. Pipeline observation produces useful Jupiter/route telemetry without moving funds. Safety gates are explicit enough to document, test, and port into TracktaOS.

### `PIPELINE_DRY_RUN` is the right default milestone

Running quote → build → simulate without signing gave the team a realistic execution path to measure before arming live submission. It exposed route rejection, simulation failure, and priority-fee issues that paper trading alone would hide.

### Append-only audit trails enable post-incident review

`execution_audit.jsonl`, `live_trades.jsonl`, `live_control_events.jsonl`, and related logs made behavior reviewable after the fact. Secret redaction and refusal to persist signed bytes reduced audit-driven credential exposure.

### Candidate handoff improved with durable identity

Scanner output now has a clearer path through `pipeline_candidates.jsonl`. `candidateIntentId` gives each scanner-to-executor candidate a stable key. Queue rows are preferred over duplicate open-paper candidates for the same address/pair. Audit seeding makes observation dedup restart-safe in the common case.

### Conservative limits are understandable

Fixed position size, single open trade, daily entry stop, and forbidden compounding/martingale flags are easy to explain to new operators and hard to misconfigure silently — provided they read `live_config.json`.

### Anomaly guard prevented blind stop sells on bad data

The −50% implied-loss threshold correctly treats many stop triggers as data problems, not strategy outcomes. Flagging live positions for manual review instead of auto-selling on suspect prices was the right capital-preservation instinct.

### Near-miss tracking supports false-negative research

Logging high-score rejections to `near_misses.json` and follow-ups at +20m/+60m/+120m supports tuning without conflating rejected names with traded outcomes.

---

## Mistakes

### File-based IPC without coordination

We assumed append-only writes and occasional full-file rewrites would "mostly work." They do — until scanner, monitor, executor, and dashboard run concurrently. Duplicate rows, corrupted JSONL, and lost monitor updates are preventable but not yet prevented.

### Duplicate code trees created a foot-gun factory

Folders like `automation/`, `hardreset/`, `harness/`, `files/`, and `phase1_files/` mirror root scripts. Fixes applied to the wrong copy do not affect running processes. Onboarding cost is higher than the duplication saved.

### `live_trades.json` vs `live_trades.jsonl` split

Executor v2 writes `.jsonl`; dashboard and legacy tooling still reference `.json`. Operators can read stale or empty panels while real events append elsewhere.

### Thesis/scanner drift was under-documented until migration

Scanner logs at score ≥ 79 with market cap up to $2.5M; executor thesis requires 80–89 and MC ≤ $250k. Paper stats looked better than live-eligible stats because the gap was implicit, not visible on every handoff row.

### Permanent dedupe was too blunt; loose dedupe duplicated work

Early pair-level permanent blocking hid legitimate future candidates. Later intent-first dedup fixed much of this, but pair cooldown and in-memory state still produce edge cases after restarts.

### Runtime data blurred into "the repo"

Large JSONL histories, backups, and zip archives lived beside source. Migration forced a painful inventory. Runtime artifacts should always be labeled as data, not code.

### `start_fomo.ps1` hardcoded the wrong project path

Startup scripts that point at `C:\Users\nalle\sol-momentum-bot` fail silently or launch the wrong tree on a new machine. Path assumptions do not survive migration.

### No CI test runner for safety scripts

`npm test` exits with error. Safety regressions in signer guards, handoff schema, and pipeline dry-run rely on manual `node test_*.js` discipline — easy to skip under time pressure.

### Unauthenticated local dashboard

Express on port 3000 can toggle automation for anyone on the host. Acceptable for solo dev; unacceptable for shared or remote machines without extra controls.

---

## Near misses

These are incidents or patterns that could have caused capital loss or false confidence but were caught by guards, ops discipline, or luck.

### Pipeline observation mistaken for live readiness

`OBSERVED` audit rows prove the unsigned pipeline succeeded at a point in time. They do not prove live fill quality under latency and MEV. Treating observation success as green-light for live would have skipped the authorization checklist.

### Paper win rate vs live edge

Paper ignores fees, failed transactions, partial fills, and priority-fee competition. A strong paper window plus pipeline success still does not justify live without reconciliation drills and dedicated RPC.

### Emergency stop during open exposure

Kill switch correctly halts everything — including automated exits. Operators who expect "stop" to mean "wind down safely" may be surprised. Manual exit may be required while automation is frozen.

### Daily stop blocks entries, not tail loss

Three losses or −0.10 SOL stops new entries — but a single trade can still lose more than the daily budget if slippage and rugs exceed nominal stop.

### GMGN CLI silent degradation

Per-interval fetch failures log and continue. A bad CLI day looks like "no setups" rather than "scanner broken." Easy to under-react.

### Near-miss follow-up survivorship

Rejected tokens that moon are visible in follow-up data; rejected tokens that rug are too. Strategy tuning toward "we should have traded the winners" is hindsight bias unless measured systematically.

### Config race between dashboard and executor

Both mutate/read `live_config.json` without locks. Transient inconsistent gate reads are rare but possible during START/STOP churn.

### Public RPC for wallet/simulation checks

Rate limits produce false "disconnected" wallet states and aborted preflight — which is annoying in dry-run but would be dangerous if mistaken for live readiness failure vs infrastructure failure.

---

## Unexpected discoveries

### JSON files that are actually JSONL

`paper_trades.json` and `near_misses.json` are newline-delimited, not JSON arrays. Standard JSON validators fail; custom tooling must know the convention.

### Monitor full-file rewrite vs scanner append

Closing a paper trade rewrites the entire `paper_trades.json` while the scanner appends new rows. This race was not obvious until multi-process operation was documented.

### `PIPELINE_DRY_RUN` skips live position management

The executor observation loop intentionally does not call `manageOpenPositions`. Mode transitions to live need an explicit runbook — not an assumed flip.

### Post-fill slippage is diagnostic, not blocking

Pre-route Jupiter validation is the protective control. Confirmed fills can exceed slippage caps; the system logs anomaly flags but does not undo the trade.

### First-live position size gate is stricter than config ceiling

`assertLiveSubmissionArmed` requires `positionSizeSol ≤ 0.01` even though Phase 1 config allows up to 0.10 SOL in `loadConfig` validation. Intentional extra gate — easy to miss when reading config alone.

### Dedup seeds from audit, cooldown partially in memory

Restart behavior depends on `execution_audit.jsonl` completeness. Incomplete audit history can repeat observations or miss cooldown intent.

### Duplicate folders were invisible in Git until placeholders

Empty test directories did not track; `.gitkeep` placeholders were needed for scanner/monitor/handoff test layout.

---

## Things never to repeat

1. **Enable live submission to "test quickly" without the full gate stack** — config LIVE, env flags, signer, dedicated RPC, authorization record, reconciliation drill.

2. **Edit scripts in `automation/`, `hardreset/`, or other archive folders** expecting production behavior to change — root scripts are canonical.

3. **Treat paper PnL as live expectancy** without thesis-filter segmentation and execution cost model.

4. **Retry ambiguous transactions blindly** when `pending_reconciliation.jsonl` has an open row — read `RECONCILIATION_RUNBOOK.md` first.

5. **Persist signed transaction bytes or secrets** to logs or state files for debugging convenience.

6. **Run multiple scanner versions in parallel** — legacy scanners pollute ledgers and confuse strategy version analysis.

7. **Assume `automationEnabled: false` means the bot is fully idle** — exits may still run; only emergency stop halts everything.

8. **Commit runtime JSONL with operational history** into the TracktaOS source package without classification and scrubbing.

9. **Skip `node live_executor.js --status`** before restart after any incident involving panic, emergency stop, or reconciliation.

10. **Merge scanner and executor filters without observability** — if the funnel narrows, tag handoff rows so research metrics remain honest.

---

## Principles that emerged

### Protect capital first

Safety gates, dry-run defaults, signer guards, explicit live arming, reconciliation pauses, and emergency stop are not friction. They are the product boundary between research and capital risk.

### Prefer simplicity, then coordinate deliberately

Small scripts and local state files made Phase 1 understandable. TracktaOS should add supervision and atomic state — not hide critical behavior behind opaque frameworks.

### Observation before optimization

Collect clean pipeline observations before tuning score weights, timeouts, or thesis bounds. Measure quote quality, route rejection, slippage, duplicate patterns, and abort codes first.

### Intent identity over blunt permanence

Prefer `candidateIntentId` and time-bounded cooldowns over permanent pair blocking. Legacy rows need pair fallback — document which rule applies when.

### Exits are not optional; entries are gated

Stopping automation must not trap open positions. Emergency stop is the only tier that freezes exits — and that tradeoff must be understood before arming live.

### Never guess on-chain state

Submission unknown, confirmation unknown, and fill parse failure → reconcile manually. A paused bot is cheaper than a wrong position ledger.

### Research wide, execute narrow

Two-layer filters are a feature if labeled honestly. Paper and pipeline stats must distinguish thesis-eligible candidates from the wider funnel.

### Documentation is part of the safety system

Architecture, decisions, known issues, and runbooks are first-class artifacts — especially for a platform (TracktaOS) that will outlive the original operator context.

---

## Related documents

- [ENGINEERING_REVIEW.md](./ENGINEERING_REVIEW.md) — system overview and prioritized improvements
- [DECISIONS.md](./DECISIONS.md) — chronological decision log
- [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) — tracked issues by severity
- [OPERATIONS.md](./OPERATIONS.md) — day-to-day procedures
- [RECONCILIATION_RUNBOOK.md](../RECONCILIATION_RUNBOOK.md) — ambiguous on-chain outcomes

---

*Last updated: 2026-06 — TracktaOS Module 1 migration.*
