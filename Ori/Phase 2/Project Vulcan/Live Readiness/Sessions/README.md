# Live Readiness — Session Evidence Index (RB-G9)

**Purpose:** Canonical index for structured post-session / post-trade / halt / ambiguity evidence under the RB-G9 Structured Storage Decision (2026-07-06).

**Rules:** Secret-free only. No private keys, raw env values, or RPC credentials. Public wallet addresses allowed. Transaction signatures allowed **only after an actual future broadcast**.

| Item | Status |
|------|--------|
| **RB-G9 structured storage** | **Defined** |
| **Live session records** | **1** — see below |
| **Closed unused sessions (no folder)** | **2** — AP01 · AP03 — see below |
| **Superseded planned sessions (no folder)** | **1** — AP02 — see below |
| **Active planned sessions (no folder yet)** | **1** — AP04 — see below |
| **Fixture drill captures** | Remain in `analysis/` (e.g. `a1_d04_rb_g9_manual_capture.json`) — **non-canonical** drill evidence |

## Closed unused / timing-abort sessions (no session folder)

| Session ID | Closure date | Disposition | Notes |
|------------|--------------|-------------|-------|
| **`RB-G9-20260709-AP01`** | **2026-07-11** | **SUPERSEDED_BEFORE_EXECUTION — EXPIRED_UNUSED** · **never armed · never executed** · no capital exposure · **do not reuse** | Closure: [`../RB-G9-20260709-AP01 UNUSED AUTHORIZATION CHAIN CLOSURE — 2026-07-11.md`](../RB-G9-20260709-AP01%20UNUSED%20AUTHORIZATION%20CHAIN%20CLOSURE%20%E2%80%94%202026-07-11.md) |
| **`RB-G9-20260711-AP03`** | **2026-07-11** | **FAIL_CLOSED_TIMING — PROOF_NOT_EXECUTED** · armed · stub created · AP/N6 not invoked · never submitted/signed/broadcast · no capital exposure · **do not reuse** | Proof gate: [`../RB-G9-20260711-AP03 ARMED NO-SUBMIT PROOF GATE — 2026-07-11.md`](../RB-G9-20260711-AP03%20ARMED%20NO-SUBMIT%20PROOF%20GATE%20%E2%80%94%202026-07-11.md) · closure: [`../RB-G9-20260711-AP03 EMERGENCY DOMAIN C CLOSURE — 2026-07-11.md`](../RB-G9-20260711-AP03%20EMERGENCY%20DOMAIN%20C%20CLOSURE%20%E2%80%94%202026-07-11.md) |

## Superseded planned sessions (no session folder)

| Session ID | Original plan | Disposition | Notes |
|------------|---------------|-------------|-------|
| **`RB-G9-20260713-AP02`** | **2026-07-13** · **14:00–20:00 MDT** | **Superseded before execution** · **never armed · never executed** · **no new AP02 authorization permitted** | Early G1 closed: [`../RB-G9-20260713-AP02 EXPIRED G1 CLOSURE — 2026-07-13.md`](../RB-G9-20260713-AP02%20EXPIRED%20G1%20CLOSURE%20%E2%80%94%202026-07-13.md) · superseded by AP03 reselection: [`../RB-G9 AP03 OPERATING WINDOW RESELECTION — 2026-07-11.md`](../RB-G9%20AP03%20OPERATING%20WINDOW%20RESELECTION%20%E2%80%94%202026-07-11.md) |

## Active planned sessions (no session folder)

| Session ID | Plan | Disposition | Notes |
|------------|------|-------------|-------|
| **`RB-G9-20260713-AP04`** | **2026-07-13** · **17:30-23:30 MDT** | **G1-G4 + production integration + process-isolation authorization signed/unused for governance only** · never armed · never executed · no capital exposure | G1-G4 receipt: [`../RB-G9-20260713-AP04 FRESH G1-G4 GOVERNANCE AUTHORIZATION — 2026-07-13.md`](../RB-G9-20260713-AP04%20FRESH%20G1-G4%20GOVERNANCE%20AUTHORIZATION%20%E2%80%94%202026-07-13.md) · production integration: [`../RB-G9 ARMED CONTINUUM PRODUCTION INTEGRATION AUTHORIZATION — 2026-07-13.md`](../RB-G9%20ARMED%20CONTINUUM%20PRODUCTION%20INTEGRATION%20AUTHORIZATION%20%E2%80%94%202026-07-13.md) · isolation auth: [`../RB-G9-20260713-AP04 PROCESS ISOLATION AUTHORIZATION — 2026-07-13.md`](../RB-G9-20260713-AP04%20PROCESS%20ISOLATION%20AUTHORIZATION%20%E2%80%94%202026-07-13.md) |

## Filed sessions

| Session ID | Date | Review state | Path |
|------------|------|--------------|------|
| **`RB-G9-20260706-EV01`** | **2026-07-07** | **NO_TRADE_EXECUTED** · session closed · **do not reuse** | [`SESSION — RB-G9-20260706-EV01 — 2026-07-07/`](SESSION%20%E2%80%94%20RB-G9-20260706-EV01%20%E2%80%94%202026-07-07/) · disarm receipt: [`../ARMED-STATE NO-TRADE DISARM AND RB-G9 GATE — 2026-07-07.md`](../ARMED%20STATE%20NO-TRADE%20DISARM%20AND%20RB-G9%20GATE%20%E2%80%94%202026-07-07.md) |

## Canonical layout

```
Sessions/
  SESSION — {sessionId} — {YYYY-MM-DD}/
    RB-G9 — REVIEW.md          ← human review (required when record created)
    rb_g9_record.json          ← optional machine sidecar (recommended)
```

**Template:** [`_templates/RB-G9-REVIEW-TEMPLATE.md`](_templates/RB-G9-REVIEW-TEMPLATE.md) · [`_templates/rb_g9_record.example.json`](_templates/rb_g9_record.example.json)

## Linked authorization storage

Signed authorizations remain under [`../Authorizations/`](../Authorizations/README.md). Each RB-G9 session record **must link** to applicable authorization paths — never duplicate signed attestation text.

## Decision reference

[`../RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md`](../RB-G9%20STRUCTURED%20STORAGE%20DECISION%20%E2%80%94%202026-07-06.md)
