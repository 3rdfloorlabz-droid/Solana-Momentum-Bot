# Live Execution Validation Plan

Live trading remains disabled. This phase validates execution quality before any decision to enable live trading.

## Phase 1: $200 Wallet

- Starting wallet capital: $200
- Initial trade size: 0.25 SOL
- Maximum open live trades: 1
- Default maximum daily loss: 0.25 SOL
- Default maximum account drawdown: 15%
- Strategy: existing `gmgn_v4` thesis only
- Every live trade requires manual confirmation

## Milestones

- First 20 trades: execution test
- First 50 trades: paper/live comparison
- First 100 trades: edge validation

## Required Safety State

No live execution may proceed unless all conditions pass:

1. `liveTradingEnabled` is explicitly set to `true`.
2. Manual confirmation is recorded when `requireManualConfirm` is enabled.
3. Open live trades remain below `maxOpenTrades`.
4. Daily realized loss remains below `maxDailyLossSol`.
5. Account drawdown remains below `maxDrawdownPercent`.
6. The candidate matches the existing `gmgn_v4` thesis.

This preparation layer does not connect to a wallet, submit transactions, or enable live trading.
