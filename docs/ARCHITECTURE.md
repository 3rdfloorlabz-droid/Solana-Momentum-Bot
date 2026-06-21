# Architecture

## Scanner

`scanner_gmgn_trending.js` is the primary market discovery process.

It pulls GMGN trending tokens through `gmgn-cli`, enriches each token with DexScreener pair data, applies momentum and safety filters, and writes accepted candidates into the local paper-trading flow.

Primary outputs:

- `paper_trades.json`
- `pipeline_candidates.jsonl`
- `near_misses.json`

## Candidate Pipeline

The candidate pipeline bridges scanner output into observation and execution review.

Accepted scanner candidates become paper trades and pipeline candidate intents. Pipeline intents include address, pair address, entry price, target, stop, market metadata, and `candidateIntentId`.

`live_executor.js` reads `pipeline_candidates.jsonl` in `PIPELINE_DRY_RUN` mode. This mode can observe candidates through quote/build/simulation checks without signing, submitting, or creating live positions.

## Monitor

`monitor.js` owns paper-trade lifecycle management.

It reads `paper_trades.json`, checks current DexScreener pair prices, and closes paper trades when one of these conditions is reached:

- target hit
- stop hit
- timeout reached

The monitor can optionally mirror a paper exit to an open live position if one exists, but that path is guarded and isolated so paper monitoring continues even if live-side logic fails.

## Execution

`live_executor.js` is the guarded execution layer.

Supported modes:

- `DRY_RUN`: legacy dry-run path.
- `PIPELINE_DRY_RUN`: observation-only pipeline path.
- `LIVE`: real execution path, gated by config, signer, RPC, wallet, route, and environment checks.

During TracktaOS migration, keep execution in `PIPELINE_DRY_RUN` unless live trading has been explicitly approved.

## Logging

The project uses append-only JSONL logs for auditability:

- `execution_audit.jsonl`: execution stages, pipeline observations, dry-run metadata.
- `live_errors.jsonl`: execution and guard failures.
- `live_control_events.jsonl`: start, stop, emergency, and reset events.
- `pipeline_candidates.jsonl`: scanner-to-executor handoff intents.
- `wallet_history.jsonl`: wallet/RPC snapshots.
- `panic_events.jsonl`: panic or emergency events.

Logs should be treated as runtime data, not source code.

## State Files

Important state files:

- `live_config.json`: execution mode, dry-run state, limits, safety flags, strategy thesis.
- `paper_trades.json`: paper trade ledger.
- `near_misses.json`: rejected or near-miss candidate ledger.
- `near_miss_followups.json`: later performance observations for near misses.
- `live_positions.json`: current live position state.
- `live_trades.jsonl`: live event history.
- `wallet_status.json`: current read-only wallet status.
- `rpc_health.json`: current RPC health snapshot.
- `simulation_results.json`: simulation summary output.

TracktaOS should keep source files, config, logs, and runtime state as separate concerns.
