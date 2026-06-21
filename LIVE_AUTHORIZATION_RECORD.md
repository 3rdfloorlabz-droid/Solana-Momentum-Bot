# FOMO Live Authorization Record

## Purpose

This document is the required written authorization before FOMO Engine 01 may be switched from PIPELINE_DRY_RUN to LIVE.

No live trading may begin unless every item below is completed, reviewed, and signed.

## Current Rule

Until this document is completed and signed:

- executionMode must remain PIPELINE_DRY_RUN
- dryRunMode must remain true
- No signer secret may be used for live submission
- No live funds may move

## Required Milestones Before LIVE

- [ ] Step 9a committed and tagged: phase1-step9a-signing
- [ ] Step 9b committed and tagged: phase1-step9b-guarded-submission
- [ ] Panic scripts committed and tested
- [ ] Reconciliation runbook committed and reviewed
- [ ] pending_reconciliation.jsonl reviewed and test records archived or cleared
- [ ] live_config.json safety state reviewed
- [ ] Dedicated RPC configured
- [ ] Wallet address verified
- [ ] Signer wallet verified
- [ ] First-live position size cap confirmed: positionSizeSol <= 0.01
- [ ] Slippage controls reviewed
- [ ] Daily stop reviewed
- [ ] Operator understands SUBMISSION_UNKNOWN, CONFIRMATION_UNKNOWN, and FILL_PARSE_UNKNOWN
- [ ] Operator understands panic procedure
- [ ] Operator understands no retry is allowed while transaction status is unknown

## First Live Trade Limits

The first authorized LIVE trade must use:

- positionSizeSol <= 0.01
- executionMode = LIVE
- dryRunMode = false
- automationEnabled = true
- emergencyStop = false
- FOMO_ENABLE_LIVE_SUBMISSION = YES
- SOLANA_SIGNER_SECRET present only for the live run
- Dedicated RPC only

## Authorization Statement

I understand that switching FOMO Engine 01 to LIVE may result in real SOL being spent, real token positions being opened, transaction fees being paid, and potential loss of funds.

I understand that this system is experimental and that no trading bot can guarantee profit.

I authorize one controlled first-live test trade under the limits above.

## Sign-Off

Operator name:

Date/time:

Wallet public address:

Maximum first-live position size:

Dedicated RPC provider:

Approved by:

Notes:

## Post-Trade Requirement

After the first live trade:

- [ ] Stop or pause new entries
- [ ] Confirm txSig on-chain
- [ ] Confirm wallet balance change
- [ ] Confirm token account change
- [ ] Confirm live position record accuracy
- [ ] Confirm no pending reconciliation event remains unresolved
- [ ] Review logs before allowing another live trade

# Final LIVE Authorization Packet — FOMO Engine 01

## Authorization Status

Status: NOT YET AUTHORIZED

This document is a pre-live authorization checklist. It does not authorize live trading unless every required field is completed and the exact authorization phrase is written at the bottom.

Required authorization phrase:

AUTHORIZED FOR LIVE

Until that phrase is written intentionally, FOMO Engine 01 must remain in PIPELINE_DRY_RUN with dryRunMode set to true.

---

## System Identity

Project: FOMO Engine 01
Repository Path: C:\Users\nalle\sol-momentum-bot
Owner/Operator: Taylor Cheaney
Wallet Public Key: FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6
Network: Solana mainnet-beta
RPC Provider: Helius dedicated RPC
Execution Phase: Phase 1 pre-live authorization

---

## Current Required Safe State Before LIVE

executionMode: PIPELINE_DRY_RUN
dryRunMode: true
automationEnabled: true
emergencyStop: false
signer secret present: no
live submission enabled: no
real money moved: no

---

## Phase 1 Milestones Completed

* Panic and reset scripts created and tested
* Step 9a local signing path reviewed
* Step 9b guarded live submission path reviewed
* Reconciliation runbook created
* Live authorization template created
* Dry-run mainnet simulation probe created
* Real pipeline watcher created
* Durable candidate handoff queue created
* Cross-source observation dedupe created
* Observation abort handling added
* Known-liquid SOL to USDC quote/build/simulation succeeded
* Public token and pair IDs preserved in audit logs
* Queue candidates confirmed observation-only
* LIVE path confirmed isolated from queued closed paper trades

---

## Known Remaining Risks

Real GMGN meme candidates have reached PIPELINE_DRY_RUN observation, but most still fail at Jupiter quote before TX_BUILD or SIMULATION.

The first live trade may fail, miss the entry, receive a bad quote, encounter slippage, or fail confirmation.

Meme token liquidity can disappear quickly.

This system is experimental and must begin with very small size.

---

## First LIVE Session Limits

First live position size: 0.005 SOL
Maximum position size allowed during first session: 0.005 SOL
Maximum number of live trades during first session: 1
Daily maximum loss: 0.01 SOL
Daily maximum trades: 1
Stop after first confirmed live trade: yes
Stop after any failed or unknown submission: yes
Stop after any reconciliation uncertainty: yes

---

## Required Pre-LIVE Checks

Before switching to LIVE, confirm each item:

[ ] Step 0 stale process check returns no live executor process:

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*live_executor*" }
```

[x] Helius API key rotated after being pasted into chat
[x] New Helius key tested with dry-run probe
[x] `validate_live_system.js` passes with 0 failures
[x] `panic.ps1` exists and can be run immediately
[x] `reset_after_panic.ps1` exists
[x] `fomo_status.ps1` confirms safe state
[x] `live_config.json` reviewed
[x] `executionMode` still PIPELINE_DRY_RUN before authorization
[x] `dryRunMode` still true before authorization
[x] no signer secret is currently present
[x] pending reconciliation file is clean or absent
[x] working tree is clean
[x] latest commit/tag recorded
[x] final Claude/Cowork safety review returns SHIP

---

## Required LIVE Flip Conditions

LIVE may only be enabled after all of these are true:

[ ] This authorization packet is complete
[ ] Exact phrase AUTHORIZED FOR LIVE is written below
[ ] Position size is set to 0.005 SOL
[ ] Daily max loss is set to 0.01 SOL
[ ] Daily max trades is set to 1
[ ] Signer secret is provided only locally and never pasted into chat
[ ] FOMO_ENABLE_LIVE_SUBMISSION is set only for the live test session
[ ] dryRunMode is switched to false only after authorization
[ ] executionMode is switched to LIVE only after authorization
[ ] emergencyStop is false
[ ] automationEnabled is true
[ ] watcher is running
[ ] operator is present and watching the terminal

---

## First LIVE Test Rules

The first live session must stop immediately after one of the following:

* one live trade is submitted
* one live trade confirms
* one live trade fails
* any submission status becomes unknown
* any confirmation status becomes unknown
* any fill parse becomes unknown
* panic is triggered
* operator is no longer actively watching

No second trade is allowed during the first live session without a new review.

---

## Final Authorization

I understand that this system can lose money.

I understand that Solana meme tokens are highly volatile and can become illiquid quickly.

I understand that this first live test is limited to one trade and 0.005 SOL.

I understand that signer secrets must never be pasted into chat or committed to Git.

I understand that any unknown submission, confirmation, or fill parse status requires stopping and using the reconciliation runbook.

Authorization phrase:

[ NOT YET AUTHORIZED ]

Operator name:

Taylor Cheaney

Date/time:

[ fill in before live ]

Final decision:

[ DO NOT RUN LIVE YET ]

