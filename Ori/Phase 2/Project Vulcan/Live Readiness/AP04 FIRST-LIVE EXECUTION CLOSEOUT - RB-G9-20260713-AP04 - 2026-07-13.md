# AP04 FIRST-LIVE EXECUTION CLOSEOUT - RB-G9-20260713-AP04 - 2026-07-13

## Result

Status: `CLOSED_FLAT_AFTER_MANDATORY_EXIT`

The AP04 first-live engineering-validation micro-live cycle executed one 0.005 SOL JUP BUY and was closed by the mandatory SELL exit. Capital exposure is closed.

This closeout does not authorize any additional live trade.

## Executed Cycle

| Field | Value |
|-------|-------|
| Session | `RB-G9-20260713-AP04` |
| Token | JUP |
| Mint | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` |
| Pair/pool reference | `3xNGdc58axYtrJ64STQz5TrdQWVtWHLR888iRBbWZnEe` |
| Entry size | 0.005 SOL |
| Entry tx | `L2Pz5v2crr94jaMLCdZzvn8CxUfxEZgJFkVyyN33oKaGhUygUrGBQ7EoTdUmAhUWVMLkDctjvH1aW7dPmGfHLEo` |
| Confirmed buy fill UI amount | `1.846305` JUP |
| Mandatory exit tx | `4BsAp9VddcECACFZNLDTeCQHTdhXudseEaVq8v4CDPsYAa3td3vM6W7fnkp4arNMzA7D8b37niFe7PaxECiHPtxH` |
| Exit amount used | `1846305` raw token units |
| Total recorded fees | `0.000015998` SOL |

## Important Finding

The initial mandatory SELL attempt failed before transaction submission because the exit path passed the confirmed UI token amount into the Jupiter quote amount field instead of raw token units.

Failure detail:

- Failure stage: `QUOTE`
- Failure code: `QUOTE_FAILED`
- Failure detail: `Quote request parameters are invalid.`
- No failed SELL transaction was signed, submitted, or broadcast.

The mandatory exit-only remediation normalized the confirmed BUY fill to raw token units and closed the position.

## Remediation

Engineering remediation was committed in:

`9e628d2002d05c42ce0a6ee94b62add4f5eb028e`

Commit subject:

`Fix AP04 raw sell amount persistence`

The remediation persists both UI and raw fill amounts and binds live SELL exits to `filledTokenAmountRaw`.

Focused tests passed before this closeout:

- `node test_r16_live_path_coupling.js` - 19/19
- `node test_step9b_submission.js`
- `node test_live_positions_atomic.js` - 15/15
- `node test_sell_liquidity_parity.js`
- `git diff --check`

Post-closeout validation:

- `node validate_live_system.js` - 0 failures

## Evidence

| Evidence | Path / fingerprint |
|----------|--------------------|
| Initial execution receipt | `analysis/rb_g9_20260713_ap04_first_live_execution_1784001899237_receipt.json` |
| Initial execution receipt SHA-256 | `06200889025e58e778d7981b296043bd2075a559fdb39dd0edf8461e2c6b3823` |
| Mandatory exit-only receipt | `analysis/rb_g9_20260713_ap04_mandatory_exit_only_1784001994477_receipt.json` |
| Mandatory exit-only receipt SHA-256 | `ea1f4c4400f1def6a61312040324180f5fdb445edf41ab6ac6a5c7f1d6016045` |

## Final Runtime State

Post-live checkpoint at closeout:

- `executionMode`: `PIPELINE_DRY_RUN`
- `dryRunMode`: `true`
- `liveArmed`: `false`
- `FOMO_ENABLE_LIVE_SUBMISSION`: unset in the process checkpoint
- Runtime stub: absent
- `live_config.json` SHA-256: `0996882e1a5244d05079a2a6f3ff09049758ecbbf3b8e3e0434ee4b13a4d33ef`
- Pending reconciliation rows: `0`
- Open live positions: `0`
- `node live_executor.js` process: none found
- Panic flag: absent
- Emergency stop flag: absent

## Boundary

This closeout records the result of the completed first-live engineering-validation cycle only.

It does not authorize:

- A second BUY
- Any executor/scanner loop
- Scaling, compounding, averaging down, or martingale behavior
- Broader strategy deployment
- OR promotion

Any second micro-live cycle requires a fresh, separate execution authorization with exact candidate, size, quote, arming, stub, signer, submission, confirmation, reconciliation, and mandatory exit bounds.

