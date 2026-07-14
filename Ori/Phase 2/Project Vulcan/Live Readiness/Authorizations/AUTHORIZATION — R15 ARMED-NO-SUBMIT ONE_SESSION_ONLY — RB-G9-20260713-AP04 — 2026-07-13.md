# AUTHORIZATION — R15 Armed-No-Submit ONE_SESSION_ONLY Session Authorization — RB-G9-20260713-AP04 — 2026-07-13

> **SIGNED — EFFECTIVE FOR ONE NO-SUBMIT ENGINEERING PROOF SESSION SCOPE ONLY**
>
> This record authorizes only the AP04 G1 governance scope for a future no-submit engineering proof path. It does not arm the system, stop processes, create a runtime stub, invoke proof tooling, submit, sign, broadcast, or expose capital.

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | RB-G9-20260713-AP04 Fresh R15 Authorization |
| **Document class marker** | **R15 Session Authorization** |
| **Record type** | `ONE_SESSION_ONLY` · Pre-Arming Session Scope (G1) |
| **Status** | **SIGNED/UNUSED — GOVERNANCE ONLY** |
| **Authorization status** | **APPROVED FOR ONE NO-SUBMIT ENGINEERING PROOF SESSION ONLY** |
| **Signer** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-13T23:08:16Z`** |
| **Signature timestamp (local)** | **`Mon Jul 13 2026 17:08:16 GMT-0600 (Mountain Daylight Time)`** |
| **Signature date** | **2026-07-13** |
| **Authorization expiry (UTC)** | **`2026-07-14T07:00:00Z`** |
| **Assigned session ID** | **`RB-G9-20260713-AP04`** |
| **Confirmed operating block** | 2026-07-13 · 17:30-23:30 MDT · UTC **`2026-07-13T23:30:00Z`** through **`2026-07-14T05:30:00Z`** |
| **Research wallet public address** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |
| **Capital exposure status** | **none** |
| **Previous sessions** | Prior EV/AP sessions are historical and must not satisfy AP04 guards |
| **AP04 remediation acceptance** | [`../Decisions/DECISION — RB-G9 AP04 Remediation Acceptance — 2026-07-11.md`](../Decisions/DECISION%20%E2%80%94%20RB-G9%20AP04%20Remediation%20Acceptance%20%E2%80%94%202026-07-11.md) |
| **AP04 pre-planning** | [`../RB-G9 AP04 Pre-Planning — Design Parameters and Blocking Prerequisites — 2026-07-11.md`](../RB-G9%20AP04%20Pre-Planning%20%E2%80%94%20Design%20Parameters%20and%20Blocking%20Prerequisites%20%E2%80%94%202026-07-11.md) |

## Schema metadata

| Field | Value |
|-------|-------|
| **`schemaVersion`** | **`2`** |
| **`approvalPurpose`** | **`armed_no_submit_proof_only`** |
| **`finalApprovalStatus`** | **`APPROVED FOR ONE NO-SUBMIT ENGINEERING PROOF SESSION ONLY`** |
| **`purpose`** | **`armed_no_submit_proof_only`** |
| **`oneSessionOnly`** | **`true`** |
| **`maximumArmedDurationMinutes`** | **`15`** |
| **`strategyReady`** | **`false`** |
| **`orStatus`** | **`not_promoted`** |

## Authorized scope

This G1 authorizes one AP04 governance session scope only. G2, G3, and G4 must bind this exact session ID, signer, wallet, purpose, status, signature timestamp, expiry, and G1 fingerprint.

Forbidden in this authorization and all downstream proof activity:

- candidate selection
- market scanning for execution
- execution quote
- final trade confirmation
- transaction construction for execution
- submit, sign, or broadcast
- transaction signature
- position, reconciliation, recovery, or capital exposure
- executor loop
- live trade execution

## AP04 production-integration blocker

The separate **RB-G9 Armed Continuum Production Integration Authorization** remains a required blocker before AP04 G1-G4 can be used for any actual armed continuum, process isolation, C1-C3 transition, runtime mirror creation, or AP/N6 invocation. This G1 does not grant that separate authority.

## Timing and no-rush thresholds

| Threshold | Requirement |
|-----------|-------------|
| G1 lifetime at Final Fresh Domain A start | At least 4 hours until expiry |
| Domain A freshness before process isolation | At least 20 minutes |
| Domain A freshness before C1 | At least 12 minutes |
| Armed remaining after stub PASS | At least 12 minutes |
| Armed remaining before AP invocation | At least 10 minutes |
| Threshold override | Forbidden — fail closed |

## Explicit non-authorizations

This signed record does not authorize process stopping, Final Fresh Domain A, process isolation, arming transition, LIVE posture, `.env` changes, `live_config.json` changes, runtime mirror creation, armed proof execution, AP/N6 invocation, live trade execution, candidate selection, submit, sign, broadcast, or capital exposure.

## Taylor Cheaney signed attestation

I, Taylor Cheaney, authorize the RB-G9-20260713-AP04 fresh G1 governance scope only. This is a no-submit engineering proof authorization path, not live trading authorization. Strategy readiness is NOT READY, no profitability claim is made, OR-20260630-008 remains not_promoted, and no trade or capital exposure is authorized.

**Taylor's explicit statement recorded in chat:**

> I authorize the RB-G9-20260713-AP04 fresh G1-G4 governance path only; no arming, no live submission, no config changes.

| Field | Value |
|-------|-------|
| **Signed** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-13T23:08:16Z`** |
| **Authorization expiry (UTC)** | **`2026-07-14T07:00:00Z`** |

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260713-AP04 — 2026-07-13.md`
