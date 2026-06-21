# Strategy

## Conservative Philosophy

The bot is designed as a conservative momentum research system first. Paper trading, observation, and dry-run execution checks come before live trading.

The strategy prefers liquid, recently active Solana tokens with measurable momentum, while rejecting candidates that look thin, overextended, concentrated, or risky.

Historical paper results are not proof of live profitability. Real execution may differ because of fees, slippage, failed transactions, liquidity changes, and latency.

## Market Cap Filters

The active scanner uses these broad candidate limits:

- minimum market cap: `$100,000`
- maximum market cap: `$2,500,000`
- minimum liquidity: `$25,000`
- minimum pool liquidity: `$25,000`

The stricter execution thesis in `live_config.json` currently narrows observation candidates toward:

- market cap: `$100,000` to `$250,000`
- GMGN trending source
- score range: `80` to `89`
- bot degen rate max: `5%`
- top-10 holder rate: `10%` to `20%`

## Momentum Logic

The scanner scores candidates from DexScreener and GMGN-derived signals:

- positive 5-minute price change
- positive 1-hour price change
- 5-minute change not above the overextension cap
- minimum 5-minute volume
- minimum 1-hour volume
- buys greater than sells in the 5-minute window
- stronger buy/sell ratios score higher
- higher liquidity and volume score higher
- moderate 5-minute and 1-hour price changes score higher
- smart degen and renowned counts can add small score bonuses

Candidates are rejected if they fail basic liquidity, holder, concentration, bot, bundler, rug-ratio, creator-hold, or dev-hold checks.

## Profit Targets

Paper trades are opened with a target price at:

```text
entryPrice * 1.10
```

That is a 10% gross target before considering real execution costs.

## Stops

Paper trades are opened with a stop price at:

```text
entryPrice * 0.95
```

That is a 5% gross stop before considering real execution costs.

The monitor also marks extreme apparent losses as `NEEDS_REVIEW` rather than blindly treating suspicious price data as a normal stop.

## Timeout Exits

The paper monitor closes trades after 20 minutes if neither target nor stop has fired.

Timeout exits are part of the conservative design: the strategy is meant to capture short-lived momentum rather than hold stale candidates indefinitely.

## Operational Principle

The strategy should graduate through phases:

1. observe candidate quality
2. validate paper outcomes
3. compare dry-run execution quality
4. review slippage, route, and simulation behavior
5. only then consider any live approval process
