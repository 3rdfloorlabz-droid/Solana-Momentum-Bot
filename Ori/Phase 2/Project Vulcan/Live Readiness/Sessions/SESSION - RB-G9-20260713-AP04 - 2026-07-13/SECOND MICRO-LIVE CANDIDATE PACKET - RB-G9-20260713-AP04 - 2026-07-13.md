# SECOND MICRO-LIVE CANDIDATE PACKET - RB-G9-20260713-AP04 - 2026-07-13

## Result

Status: `PASS_PREPARATION_ONLY_NOT_EXECUTABLE_FINAL_CONFIRMATION_REQUIRED_WITH_WARNINGS`

This packet prepares one scanner candidate for a possible AP04 second micro-live engineering-validation cycle. It is not executable by itself.

No arming, runtime stub creation, transaction build, signing, submission, broadcast, or trade occurred.

## Candidate

| Field | Value |
|-------|-------|
| Symbol | McGREJAK |
| Mint | `5b3WY1VzcxJ5AkW7CYPyFz85YPkeLtuovEX2szmApump` |
| Pair/pool | `CCGcgW5GcSoP6QeLcEKefogpNuPNK4qGefbLUYWdkkws` |
| Reference venue | pumpswap |
| Position size for quote prep | 0.005 SOL |
| Scanner source | `scanner_gmgn_trending.js` one-shot refresh |
| Scanner scan time | `2026-07-14T04:36:53.671Z` |
| Repo source pool | `non_thesis_observation` |

Scanner produced exactly one selector-visible candidate. The repo classifies it as `non_thesis_observation`, not a strict thesis candidate, because `top10HolderRate` is `0.0955`, just below the configured `0.10` floor.

## Liquidity

DexScreener capture:

- Liquidity: `$39,864.39`
- Price reference: `$0.0002886`
- Pair URL: `https://dexscreener.com/solana/ccgcgw5gcsop6qelcekefogpnupnk4qgefbluywdkkws`
- DEX: `pumpswap`

## Quote Preparation

Entry quote, preparation only:

- Input: `5000000` lamports
- Expected output: `1320263506` raw McGREJAK units
- Expected human units: `1320.263506` McGREJAK at 6 decimals
- Minimum output threshold: `1307060871` raw units
- Price impact: `0.0088015749131707954322263531`
- Slippage: `100` bps
- Route: Pump.fun Amm, `CCGcgW5GcSoP6QeLcEKefogpNuPNK4qGefbLUYWdkkws`

Exit quote, preparation only:

- Input: `1320263506` raw McGREJAK units
- Expected output: `4996525` lamports
- Expected output SOL: `0.004996525`
- Minimum output threshold: `4946560` lamports
- Price impact: `0`
- Slippage: `100` bps
- Route: Pump.fun Amm, `CCGcgW5GcSoP6QeLcEKefogpNuPNK4qGefbLUYWdkkws`

The execution gate must re-quote. The SELL must use the confirmed BUY filled raw token amount, not this preparation quote amount unless it exactly matches the confirmed fill.

## Token Safety

Read-only Solana RPC mint parse:

- Token program: `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`
- Token-2022: yes
- Decimals: `6`
- Mint authority: null
- Freeze authority: null
- Extensions: `metadataPointer`, `tokenMetadata`
- Transfer restriction detected: no
- Unsupported token extension detected: no
- Honeypot indicator in preparation: none observed; SELL quote returned

Warning: this is a Token-2022 mint. The parsed extensions are metadata-only, but Taylor should explicitly acknowledge this before any execution.

## Fee Evidence

- Trade notional: `0.005` SOL
- Base fee planning: `0.000005` SOL
- Priority fee planning: `0.0002` SOL
- Priority fee cap: `0.001` SOL
- ATA rent if created: `0.00203928` SOL, refundable
- Entry debit upper bound without ATA: `0.005205` SOL
- Entry debit upper bound with ATA: `0.00724428` SOL
- Configured minimum wallet balance: `0.12` SOL

## Readiness Snapshot

- `executionMode`: `PIPELINE_DRY_RUN`
- `dryRunMode`: `true`
- `liveArmed`: `false`
- Runtime stub: absent
- `live_config.json` SHA-256: `0996882e1a5244d05079a2a6f3ff09049758ecbbf3b8e3e0434ee4b13a4d33ef`
- Pending reconciliation rows: `0`
- Open live positions: `0`

## Warnings Requiring Final Acknowledgment

- Candidate is scanner-visible but non-thesis by the configured top-10 holder floor.
- Candidate mint is Token-2022, though only metadata extensions were detected.
- Preparation quotes are not executable; execution must obtain fresh quotes within the freshness window.
- Strategy remains NOT READY; this is engineering validation only.
- Final per-trade confirmation is absent.

## Required Final Confirmation

Use this exact confirmation only if Taylor accepts the warnings and wants to proceed to the second micro-live execution gate:

```text
I authorize AP04 second micro-live execution gate for RB-G9-20260713-AP04: perform fresh readiness/timing/flat-state checks, process isolation, C1-C3 arming transition, create a schema-valid micro_live_execution runtime stub, refresh candidate quote, and execute exactly one 0.005 SOL BUY of mint 5b3WY1VzcxJ5AkW7CYPyFz85YPkeLtuovEX2szmApump via pair/pool CCGcgW5GcSoP6QeLcEKefogpNuPNK4qGefbLUYWdkkws with mandatory SELL exit using the confirmed BUY filled token amount in raw units; I acknowledge the candidate is scanner-visible but non-thesis by the configured top10 floor and is a Token-2022 metadata-only mint; no executor/scanner loop, no second entry, no scaling, keep SOLANA_SIGNER_SECRET redacted, leave FOMO Wallet Monitor untouched, and stop/fail closed if any readiness, timing, posture, quote, candidate, token-safety, stub, signer, RPC, submission, confirmation, reconciliation, exit, or flat-state check fails.

CONFIRM RB-G9-20260713-AP04 FOR 5b3WY1VzcxJ5AkW7CYPyFz85YPkeLtuovEX2szmApump AT CCGcgW5GcSoP6QeLcEKefogpNuPNK4qGefbLUYWdkkws - ONE 0.005 SOL ENTRY AND MANDATORY EXIT USING CONFIRMED BUY RAW FILLED TOKEN AMOUNT
```

