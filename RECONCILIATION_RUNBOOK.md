# FOMO Reconciliation Runbook

## Purpose

This runbook explains what to do when `pending_reconciliation.jsonl` contains an event that requires human review.

These events mean the bot intentionally stopped instead of guessing. Do not retry, edit positions, or assume funds are safe until reconciliation is complete.

## Safety Rule

If a record appears in `pending_reconciliation.jsonl`:

1. Stop new live entries.
2. Do not retry the same trade automatically.
3. Use the full `txSig` to check on-chain status.
4. Resolve the event manually.
5. Only then update live position/trade records or resume.

## Event Types

### SUBMISSION_UNKNOWN

Meaning:

The bot built and signed a transaction. It attempted to submit it, but the HTTP request timed out or the response was lost. The transaction may or may not have reached the RPC.

Required action:

1. Copy the full `txSig` from the reconciliation record.
2. Look it up using Solscan, SolanaFM, Helius, or a dedicated RPC.
3. Check whether the transaction:
   - exists and succeeded
   - exists and failed
   - does not exist
   - is still unknown
4. Do not resubmit until status is known.

Resolution:

- If transaction succeeded: move to fill reconciliation.
- If transaction failed on-chain: mark execution failed.
- If transaction never reached chain and lastValidBlockHeight is expired: safe to treat as not landed.
- If still unknown: leave event unresolved and keep automation paused.

### CONFIRMATION_UNKNOWN

Meaning:

The transaction was submitted and a txSig exists, but confirmation polling timed out or could not determine final status.

Required action:

1. Copy the full `txSig`.
2. Look up the transaction on-chain.
3. Determine whether it succeeded, failed, or remains unknown.
4. Compare current block height with `lastValidBlockHeight` if available.

Resolution:

- If confirmed/finalized and successful: move to fill reconciliation.
- If confirmed/finalized with error: mark execution failed.
- If not found and block height exceeded lastValidBlockHeight: likely expired/not landed.
- If still unknown: keep event unresolved and do not retry.

### FILL_PARSE_UNKNOWN

Meaning:

The transaction confirmed, but the bot could not parse the fill price, token delta, or SOL delta.

Required action:

1. Copy the full `txSig`.
2. Inspect the transaction on-chain.
3. Identify wallet pre/post balances:
   - SOL spent/received
   - token amount received/sold
   - fees paid
4. Calculate fill price manually.

BUY formula:

```text
actualFillPriceSolPerToken = SOL spent / tokens received]
