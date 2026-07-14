# Candidate Packet - RB-G9-20260713-AP04 - 2026-07-13

Status: **PREPARATION ONLY - NOT EXECUTABLE - FINAL PER-TRADE CONFIRMATION NOT RECEIVED**

Prepared at (UTC): **2026-07-14T02:04:52.750Z**

Authorization expires (UTC): **2026-07-14T05:30:00.000Z** (205.14 minutes remaining at capture)

## Candidate

| Field | Value |
|---|---|
| Name / symbol | Jupiter / **JUP** |
| Mint | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` |
| Pair/pool reference | `3xNGdc58axYtrJ64STQz5TrdQWVtWHLR888iRBbWZnEe` |
| Chain / venue | Solana / meteora reference pool / Jupiter aggregated routes |
| Selection rationale | Manual engineering-validation routability baseline; candidate meets the signed liquidity floor at fresh capture; not scanner-selected; not a strategy-readiness claim |

## Fresh Liquidity Reference

| Field | Value |
|---|---|
| Source | dexscreener |
| Liquidity USD | **$78,404.87** |
| Reference price USD | 0.1483 |
| Pair URL | https://dexscreener.com/solana/3xngdc58axytrj64stqz5trdqwvtwhlr888irbbwznee |

## Entry Quote - Preparation Only

| Field | Value |
|---|---|
| Timestamp UTC | **2026-07-14T02:04:52.370Z** |
| Quote age at capture | **269 ms** |
| Input | **0.005 SOL** (5000000 lamports) |
| Expected output | **1.831523 JUP at 6 decimals** (raw `1831523`) |
| Min threshold | `1813208` |
| Price impact | **0%** |
| Slippage | **100 bps** |
| Route | BisonFi `8FnX3xo2yYw3EUE6w3nQA4GfXGS9wpK6oj3veJpbFzLo` (100%) -> Meteora DLMM `BhQEFZCRnWKQ21LEt4DUby7fKynfmLVJcNjfHNqjEF61` (100%) |

## Exit Quote - Preparation Only

| Field | Value |
|---|---|
| Timestamp UTC | **2026-07-14T02:04:52.639Z** |
| Quote age at capture | **111 ms** |
| Input | Full BUY prep output (`1831523` raw units) |
| Expected SOL out | **0.004999351 SOL** (4999351 lamports) |
| Min threshold | 4949358 lamports |
| Price impact | **0.0011736457048605308228869978%** |
| Slippage | **100 bps** |
| Route | ZeroFi `Et6HnPjetV8AzmxNAfzKJ6ax5VM82ZB7phY465Ns5iZW` (100%) -> TesseraV `DNhfyh75AApg1L1Yig3fErvERKutYRqfWLGb496iViSZ` (100%) -> PancakeSwap `8tpmZEtYup1UEXNqaKoXWE5eiK7yqxh9cGfh76YeCtuC` (100%) |
| SELL route verified | **Yes, preparation quote only** |

## Token Safety - Read-Only RPC

| Check | Result |
|---|---|
| Token program | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| Mint authority | **null** |
| Freeze authority | **null** |
| Decimals | **6** |
| Token-2022 | **No** |
| Honeypot/sellability prep signal | SELL quote returned; no block observed |

## CS1-CS13

| ID | Result |
|---|---|
| CS1 | **PASS_MANUAL_ENGINEERING_BASELINE** |
| CS2 | **PASS** |
| CS3 | **PASS** |
| CS4 | **PASS** |
| CS5 | **PASS** |
| CS6 | **PASS_AT_CAPTURE_REFETCH_REQUIRED** |
| CS7 | **PASS** |
| CS8 | **PASS** |
| CS9 | **PASS** |
| CS10 | **PASS_PREPARATION_QUOTE** |
| CS11 | **PASS_PREPARATION_QUOTE** |
| CS12 | **PASS_WITH_ROUTE_ASYMMETRY_NOTE** |
| CS13 | **PASS_PREPARATION_FEE_MODEL** |

## Readiness Notes

- Current posture remains dry/disarmed: `PIPELINE_DRY_RUN`, dryRunMode `true`, liveArmed `false`.
- Flat state: pending reconciliation `0`, open live positions `0`, recovery actions `0`.
- Runtime-health direct builder classified: **CAPITAL_SAFE_BUT_RUNTIME_AMBIGUOUS** with warnings STALE_SCANNER, EXECUTOR_LOOP_UNCONFIRMED.
- Dashboard endpoint was unavailable; no process start was authorized or performed.
- This packet is not executable. Fresh quote <= 10 seconds and final per-trade confirmation are required before any separately authorized execution gate.

## Exact Final Confirmation String - Unsigned

```text
CONFIRM RB-G9-20260713-AP04 FOR JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN AT 3xNGdc58axYtrJ64STQz5TrdQWVtWHLR888iRBbWZnEe - ONE 0.005 SOL ENTRY AND MANDATORY EXIT
```

Final per-trade confirmation received: **No**

Linked machine record: `candidate_packet.json`
