# AUTHORIZATION — Arming — Pre-Transition — RB-G9-20260713-AP04 — 2026-07-13

> **SIGNED — ARMING AUTHORIZATION ONLY**
>
> **ACTUAL ARMING NOT PERFORMED**
>
> **NO LIVE SUBMISSION · NO CONFIG CHANGE · NO CAPITAL EXPOSURE**
>
> This record authorizes only a future AP04 Arming Transition Gate for one temporary C1-C3 posture transition. It does not change `.env`, change `live_config.json`, arm production, create a runtime stub, invoke proof tooling, submit, sign, broadcast, or expose capital.

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | RB-G9-20260713-AP04 Arming Authorization |
| **Record type** | Arming Authorization · Governance-only (G2) |
| **Status** | **SIGNED/UNUSED — GOVERNANCE ONLY** |
| **Authorization status** | **APPROVED FOR ONE FUTURE C1-C3 POSTURE TRANSITION ONLY** |
| **Signer** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-13T23:08:17Z`** |
| **Signature timestamp (local)** | **`Mon Jul 13 2026 17:08:17 GMT-0600 (Mountain Daylight Time)`** |
| **Signature date** | **2026-07-13** |
| **Linked session ID** | **`RB-G9-20260713-AP04`** |
| **Linked G1 (R15)** | [`AUTHORIZATION — R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY — RB-G9-20260713-AP04 — 2026-07-13.md`](AUTHORIZATION%20%E2%80%94%20R15%20ARMED-NO-SUBMIT%20ONE_SESSION_ONLY%20%E2%80%94%20RB-G9-20260713-AP04%20%E2%80%94%202026-07-13.md) |
| **Linked G1 fingerprint (SHA-256)** | **`74039b884a545a074057baffdb8dee4cef435d26cdfc601c41156b3ea73857ec`** |
| **G1 signature timestamp (UTC)** | **`2026-07-13T23:08:16Z`** |
| **G1 authorization expiry (UTC)** | **`2026-07-14T07:00:00Z`** |
| **Research wallet public address** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| **Maximum LIVE_ARMED duration** | **15 minutes** |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |
| **Capital exposure status** | **none** |

## G2 scope

Taylor authorizes only one future C1-C3 arming transition gate, bound exclusively to session **`RB-G9-20260713-AP04`** and G1 fingerprint **`74039b884a545a074057baffdb8dee4cef435d26cdfc601c41156b3ea73857ec`**.

The future transition may proceed only if all preconditions pass at that future gate: G1-G4 signed, valid, unused, same session; separate AP04 production-integration authorization granted; process-isolation authorization granted; Final Fresh Domain A PASS; process isolation PASS; flat state; zero executor loops; and all AP04 no-rush thresholds satisfied.

## Future C1-C3 changes authorized only at a later gate

| Order | Target | Field | Future authorized change |
|-------|--------|-------|--------------------------|
| **C1** | gitignored `.env` | `FOMO_ENABLE_LIVE_SUBMISSION` | not YES to **`YES`** |
| **C2** | `live_config.json` | `executionMode` | `PIPELINE_DRY_RUN` to **`LIVE`** |
| **C3** | `live_config.json` | `dryRunMode` | `true` to **`false`** |

These changes are **not performed** by this record and remain forbidden until a later explicit arming transition gate.

## AP04 production-integration blocker

This G2 cannot be used until the separate **RB-G9 Armed Continuum Production Integration Authorization** has been granted. This G2 does not grant that separate authority.

## Explicit non-authorizations

This signed record does not authorize process stopping now, C1-C3 now, `.env` changes now, `live_config.json` changes now, runtime mirror creation, AP/N6 invocation, candidate selection, transaction construction, submit, sign, broadcast, live trade execution, executor loop, OR promotion, or capital exposure.

## Taylor Cheaney signed attestation

I, Taylor Cheaney, authorize the AP04 G2 governance record only for one future C1-C3 posture transition, linked to G1 fingerprint **`74039b884a545a074057baffdb8dee4cef435d26cdfc601c41156b3ea73857ec`**. No arming, live submission, config change, or capital exposure is authorized now.

**Taylor's explicit statement recorded in chat:**

> I authorize the RB-G9-20260713-AP04 fresh G1-G4 governance path only; no arming, no live submission, no config changes.

| Field | Value |
|-------|-------|
| **Signed** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-13T23:08:17Z`** |

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Arming — RB-G9-20260713-AP04 — 2026-07-13.md`
