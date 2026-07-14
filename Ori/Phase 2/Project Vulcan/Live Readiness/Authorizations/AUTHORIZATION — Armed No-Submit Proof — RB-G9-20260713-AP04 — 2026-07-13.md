# AUTHORIZATION — Armed No-Submit Proof — RB-G9-20260713-AP04 — 2026-07-13

> **SIGNED — ARMED NO-SUBMIT PROOF AUTHORIZATION ONLY**
>
> **PROOF NOT EXECUTED**
>
> **NO ARMING · NO RUNTIME STUB · NO AP/N6 INVOCATION**
>
> **NO SUBMIT · NO SIGN · NO BROADCAST · NO CAPITAL EXPOSURE**
>
> This record authorizes only a future AP04 Armed No-Submit Proof Execution Gate after all prerequisite gates pass. It does not stop processes, run Domain A, perform process isolation, perform C1-C3, arm production, create the runtime stub, invoke proof tooling now, submit, sign, broadcast, or expose capital.

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | RB-G9-20260713-AP04 Armed No-Submit Proof Authorization |
| **Record type** | Armed No-Submit Proof Authorization · Governance-only (G4) |
| **Status** | **SIGNED/UNUSED — GOVERNANCE ONLY** |
| **Authorization status** | **APPROVED FOR ONE FUTURE ARMED NO-SUBMIT PROOF ATTEMPT ONLY** |
| **Signer** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-13T23:08:19Z`** |
| **Signature timestamp (local)** | **`Mon Jul 13 2026 17:08:19 GMT-0600 (Mountain Daylight Time)`** |
| **Signature date** | **2026-07-13** |
| **Linked session ID** | **`RB-G9-20260713-AP04`** |
| **Linked G1 (R15)** | [`AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260713-AP04 — 2026-07-13.md`](AUTHORIZATION%20%E2%80%94%20R15%20ARMED-NO-SUBMIT%20ONE_SESSION_ONLY%20%E2%80%94%20RB-G9-20260713-AP04%20%E2%80%94%202026-07-13.md) |
| **Linked G1 fingerprint (SHA-256)** | **`74039b884a545a074057baffdb8dee4cef435d26cdfc601c41156b3ea73857ec`** |
| **Linked G2 (Arming)** | [`AUTHORIZATION — Arming — RB-G9-20260713-AP04 — 2026-07-13.md`](AUTHORIZATION%20%E2%80%94%20Arming%20%E2%80%94%20RB-G9-20260713-AP04%20%E2%80%94%202026-07-13.md) |
| **Linked G2 fingerprint (SHA-256)** | **`7b21238734d3bff7fe6add2fef86dfdbcf9730f97cc2e6b35d42e3da6e5d8613`** |
| **Linked G3 (Runtime Stub)** | [`AUTHORIZATION — Runtime Stub Creation — RB-G9-20260713-AP04 — 2026-07-13.md`](AUTHORIZATION%20%E2%80%94%20Runtime%20Stub%20Creation%20%E2%80%94%20RB-G9-20260713-AP04%20%E2%80%94%202026-07-13.md) |
| **Linked G3 fingerprint (SHA-256)** | **`9d3e8e311d20ef96d5522debe21c9617bd99a0ef2cec60c54b30f7b61f55c9ce`** |
| **G1 signature timestamp (UTC)** | **`2026-07-13T23:08:16Z`** |
| **G1 authorization expiry (UTC)** | **`2026-07-14T07:00:00Z`** |
| **Research wallet public address** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **Maximum LIVE_ARMED duration** | **15 minutes** |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |
| **Capital exposure status** | **none** |

## G4 scope

Taylor authorizes only one future AP04 armed no-submit proof attempt, bound exclusively to session **`RB-G9-20260713-AP04`** and the fresh G1-G3 fingerprints above.

Prerequisite chain before any proof execution:

- G1-G4 signed, valid, unused, and same-session
- separate AP04 production-integration authorization granted
- process-isolation authorization granted
- Final Fresh Domain A PASS
- process isolation PASS
- C1-C3 completed under G2
- `LIVE_ARMED` confirmed
- G3-authorized runtime stub created and validated
- at least 12 minutes armed time remaining after stub PASS
- at least 10 minutes armed time remaining before AP invocation
- zero executor loops
- no candidate, quote, transaction construction, submit, sign, broadcast, transaction signature, position, reconciliation, recovery, or capital exposure

## Authorized future proof tooling only

| Tool | Future role |
|------|-------------|
| `node validate_armed_preflight.js` | Armed validator, session-scoped |
| `node run_armed_preflight_manifest.js` | AP-01 through AP-20 manifest, one invocation |
| `node test_n6_armed_estop_probe.js` | Armed-safe N6 probe, one invocation |
| Domain C closure checks | Immediate rollback and safety verification after PASS, FAIL, abort, ambiguity, or timeout |

## Required no-execution prohibitions

This G4 explicitly prohibits candidate selection, market scanning for execution, execution quote, final trade confirmation, transaction construction for execution, submit, sign, broadcast, transaction signature, position, reconciliation, recovery, executor loop, live trade execution, and capital exposure.

## AP-15 replacement boundary

AP-15 remains `NOT_APPLICABLE_WITH_REPLACEMENT_EVIDENCE` under replacement evidence ID `armed-no-submit-proof-scope`. The proof must show no execution candidate, no quote, no trade confirmation, no transaction construction, no submit, no signing, no broadcast, no `txSig`, no position, and no capital action.

## AP04 production-integration blocker

This G4 cannot be used until the separate **RB-G9 Armed Continuum Production Integration Authorization** has been granted. This G4 does not grant that separate authority.

## Explicit non-authorizations

This signed record does not authorize AP/N6 invocation now, process stop now, Domain A now, process isolation now, C1-C3 now, arming now, runtime stub now, `.env` changes, `live_config.json` changes, candidate selection, quote, transaction construction, submit, sign, broadcast, live trade execution, executor loop, OR promotion, readiness claim, profitability claim, or capital exposure.

## Taylor Cheaney signed attestation

I, Taylor Cheaney, authorize the AP04 G4 governance record only for one future armed no-submit proof attempt linked to G1 fingerprint **`74039b884a545a074057baffdb8dee4cef435d26cdfc601c41156b3ea73857ec`**, G2 fingerprint **`7b21238734d3bff7fe6add2fef86dfdbcf9730f97cc2e6b35d42e3da6e5d8613`**, and G3 fingerprint **`9d3e8e311d20ef96d5522debe21c9617bd99a0ef2cec60c54b30f7b61f55c9ce`**. No proof execution, arming, live submission, config change, or capital exposure is authorized now.

**Taylor's explicit statement recorded in chat:**

> I authorize the RB-G9-20260713-AP04 fresh G1-G4 governance path only; no arming, no live submission, no config changes.

| Field | Value |
|-------|-------|
| **Signed** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-13T23:08:19Z`** |

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Armed No-Submit Proof — RB-G9-20260713-AP04 — 2026-07-13.md`
