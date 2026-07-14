# AUTHORIZATION - Second Micro-Live Execution - Engineering Validation ONE_SESSION_ONLY - RB-G9-20260713-AP04 - 2026-07-13

> SECOND MICRO-LIVE EXECUTION AUTHORIZATION GOVERNANCE RECORD ONLY
>
> NO CANDIDATE SELECTED. NO EXECUTION PERFORMED.
>
> THIS RECORD DOES NOT ARM, SUBMIT, SIGN, BROADCAST, OR TRADE.
>
> FINAL PER-TRADE CONFIRMATION STILL REQUIRED BEFORE ANY BUY.

This record authorizes one future, separately executed, bounded second micro-live engineering-validation cycle for session `RB-G9-20260713-AP04`, subject to the constraints below.

It does not select a token, request a quote, start a loop, expose capital, or execute any trade in this gate.

---

## Record metadata

| Field | Value |
|-------|-------|
| Gate name | AP04 Second Micro-Live Execution Authorization Governance Gate |
| Record type | Second Micro-Live Execution Authorization - governance-only |
| Status | SIGNED - GOVERNANCE AUTHORIZED - NO EXECUTION PERFORMED - NO CAPITAL EXPOSURE IN THIS GATE |
| Signer | Taylor Cheaney |
| Signature date | 2026-07-13 America/Denver |
| Signature timestamp (UTC) | 2026-07-14T04:25:14.7585908Z |
| Signature timestamp (local) | 2026-07-13 22:25:10 America/Denver |
| Authorization expiry (UTC) | 2026-07-14T05:30:00.000Z |
| Expiry basis | AP04 operating block end; does not extend beyond the AP04 block |
| Linked session | `RB-G9-20260713-AP04` |
| First micro-live closeout | CLOSED_FLAT_AFTER_MANDATORY_EXIT |
| Research wallet public address | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| Runtime stub path | `analysis/r15_manual_approval_record.json` - absent in this gate |
| OR-20260630-008 | not_promoted |
| Strategy readiness | NOT READY |
| Capital exposure status | none |

---

## 1. Authorized scope

Taylor authorizes one future manually supervised second micro-live engineering-validation cycle only:

| Authorized scope | Detail |
|------------------|--------|
| Purpose | Engineering validation of the remediated real submit/confirm/reconcile/exit path, not strategy deployment |
| Entry | Maximum 1 BUY |
| Exit | Exactly 1 mandatory SELL to return flat |
| Entry and exit authorized together | Yes, for this single cycle only |
| Second entry inside the cycle | Forbidden |
| Position size | 0.005 SOL maximum unless Taylor separately specifies a smaller exact size |
| 0.01 SOL escalation | Not authorized |
| Scaling / compounding / averaging / martingale | Forbidden |
| Unattended execution | Forbidden |
| Loop authorization | `FOMO_ALLOW_LOOP_LIVE=YES` forbidden; executor/scanner loops forbidden |
| Execution mode | Attended, single-shot, no-loop |

This governance record is insufficient by itself to execute. A later execution gate must pass fresh readiness checks and Taylor must provide final per-trade confirmation after candidate and fresh quote details are shown.

---

## 2. Candidate constraints for future execution gate

No candidate is selected or approved in this gate. Before any future BUY, the operator must record and re-check:

| # | Constraint |
|---|------------|
| CS1 | Manual candidate selection only; no autonomous scanner loop |
| CS2 | Token mint address recorded |
| CS3 | Exact pair/pool address recorded |
| CS4 | Pool liquidity at least 25,000 USD, freshly verified |
| CS5 | Quoted price impact no more than 2.0% |
| CS6 | Quote age no more than 10 seconds at submit |
| CS7 | Quoted slippage no more than 100 bps |
| CS8 | No known freeze authority, transfer restriction, unsupported token extension, or obvious honeypot behavior where detectable |
| CS9 | Route and venue documented without secrets |
| CS10 | Reliable BUY route via dedicated RPC and `public_micro_live_only` |
| CS11 | Reliable SELL route under execution bounds |
| CS12 | Entry/exit route consistency documented |
| CS13 | Fee decomposition documented using current fee accounting |
| CS14 | SELL exit uses the confirmed BUY filled token amount in raw units, not UI token units |

Reject the execution gate if any candidate constraint fails.

---

## 3. Execution bounds

| Parameter | Bound |
|-----------|-------|
| Target | +10% from monitoring entry price unless Taylor specifies a different exact bound |
| Stop | -5% from monitoring entry price unless Taylor specifies a different exact bound |
| Position timeout | 20 minutes |
| Confirmation timeout | 30 seconds |
| Realized slippage halt | 200 bps post-fill |
| Session loss stop | 0.03 SOL |
| Daily loss stop | 0.03 SOL |
| `maxDailyLossCount` | 2 |
| Default slippage cap | 100 bps |
| Price impact cap | 2.0% |
| Quote freshness | 10 seconds |
| Min pool liquidity | 25,000 USD |
| MEV route mode | `public_micro_live_only` |
| Max open positions | 1 |
| Max trades this cycle | 1 entry plus mandatory exit |

---

## 4. Required future execution-gate prerequisites

A future second micro-live execution gate may proceed only if all pass immediately before any BUY:

| # | Prerequisite |
|---|--------------|
| P1 | This authorization is valid and not expired |
| P2 | First AP04 micro-live closeout remains accepted: flat, dry/disarmed, no pending reconciliation |
| P3 | Raw-unit exit-path remediation is present at or after commit `9e628d2002d05c42ce0a6ee94b62add4f5eb028e` |
| P4 | Fresh Domain A safety evidence is still valid or recaptured |
| P5 | Process isolation passes; zero executor loops; FOMO Wallet Monitor untouched unless separately authorized |
| P6 | C1-C3 arming transition separately authorized and passes |
| P7 | A schema-valid `micro_live_execution` runtime R15 stub is separately authorized, created, and loader-valid |
| P8 | Signer presence and configured wallet match verified redacted |
| P9 | Dedicated RPC read-only/pre-submit readiness passes |
| P10 | Candidate CS1-CS14 recorded and freshly re-verified |
| P11 | Taylor final per-trade confirmation is given after fresh quote details |
| P12 | 0 open live positions; 0 pending reconciliation; capital exposure none |
| P13 | No governance ambiguity, panic, emergency stop, posture drift, or validator failure |

---

## 5. Final per-trade confirmation

This authorization alone is insufficient to execute.

Final confirmation must bind:

- Session ID
- Token mint
- Exact pair/pool
- Entry size
- Fresh quote details
- Mandatory exit using the confirmed BUY filled token amount in raw units

Required confirmation template for the future execution gate:

> I confirm final per-trade authorization for session `RB-G9-20260713-AP04`: BUY `{SIZE_SOL}` SOL of mint `{MINT}` via pair/pool `{PAIR}` with mandatory SELL exit using the confirmed BUY filled token amount in raw units. I acknowledge this is engineering validation only, not strategy deployment, and no second entry is authorized.

---

## 6. Expiration and invalidation

This authorization expires or is invalidated under any of the following:

| # | Trigger |
|---|---------|
| X1 | AP04 operating block end: 2026-07-14T05:30:00.000Z |
| X2 | Any AP04 prerequisite proof is superseded, contradicted, or closed invalid |
| X3 | Posture drift, panic, emergency stop, ambiguity, or validator failure |
| X4 | Signer or wallet mismatch |
| X5 | Candidate constraint failure |
| X6 | No entry within 60 minutes after a separately authorized execution gate starts |
| X7 | One entry executed; entry authority consumed and exit authority survives only to close the authorized position |
| X8 | Secret exposure |
| X9 | Any attempt to use an executor loop or `FOMO_ALLOW_LOOP_LIVE=YES` |

After expiration without entry: remain or return dry/disarmed, remove/consume any runtime stub, and file the appropriate RB-G9 no-trade or aborted evidence if an execution gate had begun.

---

## 7. Explicit non-authorizations in this gate

| Item | Status |
|------|--------|
| Candidate selected or approved | No |
| Final per-trade confirmation given | No |
| Actual execution performed | No |
| Transaction submission, signing, or broadcast | No |
| Trade or capital exposure | No |
| `live_config.json` modified | No |
| `.env` modified | No |
| Runtime stub created | No |
| Executor loop started | No |
| `FOMO_ALLOW_LOOP_LIVE=YES` | No |
| OR-20260630-008 promoted | No |
| Strategy readiness or profitability claim | No |

---

## 8. Linked AP04 evidence

| Evidence | Path / fingerprint |
|----------|--------------------|
| First AP04 micro-live closeout | `Ori/Phase 2/Project Vulcan/Live Readiness/AP04 FIRST-LIVE EXECUTION CLOSEOUT - RB-G9-20260713-AP04 - 2026-07-13.md` |
| Initial execution receipt | `analysis/rb_g9_20260713_ap04_first_live_execution_1784001899237_receipt.json` - `06200889025e58e778d7981b296043bd2075a559fdb39dd0edf8461e2c6b3823` |
| Mandatory exit-only receipt | `analysis/rb_g9_20260713_ap04_mandatory_exit_only_1784001994477_receipt.json` - `ea1f4c4400f1def6a61312040324180f5fdb445edf41ab6ac6a5c7f1d6016045` |
| Raw-unit exit-path remediation | Commit `9e628d2002d05c42ce0a6ee94b62add4f5eb028e` |

---

## 9. Taylor Cheaney signed attestation

I, Taylor Cheaney, authorize the AP04 Second Micro-Live Execution Authorization Governance Gate for session `RB-G9-20260713-AP04`.

I acknowledge:

1. This record authorizes one future bounded second micro-live engineering-validation cycle only.
2. This gate does not arm, submit, sign, broadcast, trade, or expose capital.
3. No candidate is selected and no final per-trade confirmation is given in this gate.
4. A separate future execution gate must pass fresh readiness, create a schema-valid `micro_live_execution` runtime stub, present candidate and quote details, and receive my final per-trade confirmation before any BUY.
5. Strategy readiness is NOT READY; this is engineering validation only.
6. OR-20260630-008 remains not_promoted.
7. 0.01 SOL, loops, scaling, compounding, averaging down, and unattended execution are not authorized.

Explicit user authorization recorded in chat:

> ok lets do the closeout and push then authorize a second micro live

Signer: Taylor Cheaney
Signature timestamp (UTC): 2026-07-14T04:25:14.7585908Z
Authorization expiry (UTC): 2026-07-14T05:30:00.000Z
Linked session ID: RB-G9-20260713-AP04
Final approval status: APPROVED FOR ONE FUTURE SECOND MICRO-LIVE EXECUTION CYCLE - GOVERNANCE AUTHORIZATION ONLY - NO EXECUTION IN THIS GATE

---

Canonical path:

`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION - Second Micro-Live Execution - RB-G9-20260713-AP04 - 2026-07-13.md`

