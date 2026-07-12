# Solana Momentum Bot

Solana Momentum Bot is a research and execution-safety project for testing momentum token setups on Solana. It scans GMGN trending candidates, writes paper trades, monitors paper exits, records near misses, runs pipeline dry-run quote/build/simulation checks, and exposes a local dashboard for review.

This repository is being prepared for migration into TracktaOS. Treat the current codebase as an existing bot implementation with active runtime data, not a clean greenfield package.

## Canonical Code Path (Read First)

**Run and edit scripts only in the repository root.** The live bot does not use copies in archive folders.

| Do not run or patch for production | Status |
|-----------------------------------|--------|
| `automation/` | Non-canonical archive copy |
| `hardreset/` | Non-canonical archive copy |
| `harness/` | Non-canonical archive copy |
| `files/` | Non-canonical archive copy |
| `phase1_files/` | Non-canonical archive copy |

Changes under those folders **do not affect** a bot started from the root with `start_fomo.ps1` or `node …` commands below. Legacy root scripts such as `scanner.js`, `scanner_v3.js`, and `scanner_trending.js` are also inactive—use **`scanner_gmgn_trending.js`** only.

**Authoritative list:** [ACTIVE_MANIFEST.md](./ACTIVE_MANIFEST.md)

## Current Safety State

Live trading must remain disabled unless explicitly approved.

The expected safe operating mode is:

- `executionMode: "PIPELINE_DRY_RUN"`
- `dryRunMode: true`
- no signer secret loaded
- no `FOMO_ENABLE_LIVE_SUBMISSION=YES`
- no live transaction submission

Do not put private keys, seed phrases, API keys, or signer byte arrays in source files, docs, screenshots, or commits.

## Dedicated RPC (A4)

A4 is a **reliability gate**, not a convenience setting. Trust-critical executor RPC stages (priority fee, simulation, submission, confirmation, fill parse) **refuse** the public `api.mainnet-beta.solana.com` fallback and require a dedicated (non-public) endpoint. Observation/dry-run may tolerate public fallback where allowed.

Supported variables (executor precedence in `live_executor.js`, first non-public match wins):

1. `HELIUS_RPC_URL` — explicit dedicated Helius endpoint
2. `SOLANA_RPC_URL` — explicit dedicated RPC endpoint
3. `HELIUS_API_KEY` — used to derive a Helius endpoint only if the two above are unset

Notes:

- **Configuring an RPC is not the same as verifying A4.** A configured endpoint is `configured`, not `verified dedicated`, until runtime evidence confirms the dedicated class was actually used and no public fallback occurred.
- `RPC_URL` is **not** consumed by the executor RPC path or the dashboard A4 readiness panel (only `validate_live_preflight.js` references it). Do not rely on it for A4.
- Never place real keys or private URLs in source, docs, logs, or commits. RPC endpoints must be redacted (no raw URLs/tokens) wherever displayed.
- A4 remains **unresolved** until runtime evidence confirms a verified dedicated path. Dedicated RPC config does **not** imply live readiness.

## Setup

Install Node.js 18 or newer, then install dependencies:

```powershell
npm install
```

Create a local environment file from the template if needed:

```powershell
Copy-Item .env.example .env
```

Keep live-only variables blank unless a live-trading approval process has explicitly authorized them.

## Common Commands

Run the GMGN scanner once:

```powershell
node scanner_gmgn_trending.js
```

Run the GMGN scanner continuously:

```powershell
node scanner_gmgn_trending.js --watch
```

Run the paper-trade monitor:

```powershell
node monitor.js
```

Run near-miss follow-up tracking:

```powershell
node near_miss_followup.js --watch
```

Validate paper-trade data:

```powershell
node validate_data.js
```

Analyze forward-test results:

```powershell
node analyze_forward_test.js
```

Start the local dashboard:

```powershell
node dashboard_server.js
```

Then open:

```text
http://localhost:3000
```

Check executor status without running a cycle:

```powershell
node live_executor.js --status
```

Run syntax checks for key files:

```powershell
node --check live_executor.js
node --check dashboard_server.js
node --check scanner_gmgn_trending.js
```

Run focused safety tests:

```powershell
node test_observation_pool.js
node test_pipeline_candidate_handoff.js
node test_pipeline_dry_run.js
node test_signer_guard.js
node test_step9a_signing.js
node test_step9b_submission.js
```

## Files To Know

**Canonical paths:** see [ACTIVE_MANIFEST.md](./ACTIVE_MANIFEST.md) for the authoritative list of active scripts, config, state files, and non-canonical archive folders.

- `scanner_gmgn_trending.js`: active GMGN trending scanner and paper/pipeline candidate writer.
- `monitor.js`: paper-trade monitor for target, stop, and timeout outcomes.
- `near_miss_followup.js`: follow-up tracker for rejected candidates.
- `live_executor.js`: guarded execution layer, including `PIPELINE_DRY_RUN` observation flow and live safety gates.
- `dashboard_server.js`: local dashboard for paper results, safety state, wallet/RPC status, and execution telemetry.
- `wallet_monitor.js`: read-only wallet/RPC monitor.
- `live_config.json`: runtime safety/config state. Do not switch to live mode without explicit approval.
- `execution_audit.jsonl`, `paper_trades.json`, `pipeline_candidates.jsonl`, `near_misses.json`: runtime data files.
- `docs/ARCHITECTURE.md`: system structure for TracktaOS migration.
- `docs/OPERATIONS.md`: operating procedures and safety checklist.
- `MIGRATION_NOTES.md`: migration inventory and verification checklist.

## Safety Notes

- Do not run `node live_executor.js --cycle` or `node live_executor.js --loop` in `LIVE` mode without approval.
- Do not set `executionMode=LIVE` or `dryRunMode=false` during migration.
- Do not set `FOMO_ENABLE_LIVE_SUBMISSION=YES` unless live submission has been explicitly authorized.
- Do not set `FOMO_ALLOW_LOOP_LIVE=YES` unless live loop operation has been explicitly authorized.
- Do not load or print `SOLANA_SIGNER_SECRET` for documentation, tests, or migration review.
- Prefer `node live_executor.js --status` and validation tests for safe checks.
- Runtime JSON/JSONL files may contain operational history and should be reviewed before import into TracktaOS.

## TracktaOS Migration

The migration should preserve the current separation between research, observation, and live execution:

1. Scanner and paper monitor produce research data.
2. Pipeline dry-run observes candidates without signing or submitting.
3. Live execution remains gated behind config, environment variables, signer validation, route checks, and manual approval.
4. TracktaOS should ingest runtime telemetry without weakening live guards.
