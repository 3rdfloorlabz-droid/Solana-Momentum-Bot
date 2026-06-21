# Roadmap

## Phase 1: Stabilize Momentum Bot

Goals:

- keep live trading disabled by default
- stabilize scanner, monitor, dashboard, and pipeline dry-run behavior
- improve test coverage for observation, dedupe, signer guards, and execution logging
- cleanly separate source files from runtime data
- prepare TracktaOS migration boundaries
- document operations, architecture, and strategy assumptions

## Phase 2: Wallet Intelligence

Goals:

- build richer wallet/RPC health monitoring
- track wallet balance changes over time
- analyze wallet exposure and realized/unrealized risk
- improve alerting around low balance, stale RPC, and pending reconciliation
- keep wallet intelligence read-only until explicitly approved

## Phase 3: Cross-Chain Opportunity Engine

Goals:

- generalize candidate discovery beyond Solana
- normalize token, pair, liquidity, holder, and volume data across chains
- compare opportunity quality across ecosystems
- preserve chain-specific execution and safety boundaries
- avoid mixing research signals with live execution until each chain has its own guardrails

## Phase 4: FOMO Project

Goals:

- package the momentum engine into a broader FOMO research product
- define user-facing dashboards, reports, and alerts
- add configurable strategy profiles
- develop safer review workflows for high-volatility opportunities
- keep production live-trading features behind explicit authorization

## Phase 5: Ori Integration

Goals:

- integrate Ori as the higher-level intelligence and coordination layer
- let Ori reason over scanner results, paper outcomes, wallet telemetry, and execution audit logs
- add guided review flows for strategy changes and risk decisions
- support TracktaOS-native tasking, memory, and operator workflows
- preserve the bot's conservative safety philosophy as capabilities expand
