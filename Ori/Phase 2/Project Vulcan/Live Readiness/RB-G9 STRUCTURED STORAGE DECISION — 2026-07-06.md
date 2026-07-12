# RB-G9 Structured Storage Decision — 2026-07-06

Status:
**Decision complete — canonical RB-G9 session evidence storage location, schema, states, and linkage rules defined; no arming, execution, or capital action**

Gate type:
Governance / documentation decision — structured post-session evidence storage policy only

Prerequisites:
`R15 SECURE STORAGE DECISION — 2026-07-06.md` · `MICRO-LIVE RUNBOOK CONSOLIDATION — 2026-07-05.md` · `RUNBOOK DOCUMENTATION UPDATE — 2026-07-06.md` · `A1-D04 RECONCILIATION DRILL EXECUTION — 2026-07-06.md` · `A1-D05 AUDIT DURABILITY DRILL EXECUTION — 2026-07-06.md` · `LIVE SUBMISSION PATH READINESS REVIEW — 2026-07-06.md` · `REAL RPC NO-BROADCAST READINESS CHECK — 2026-07-06.md` · `ACTIVE_MANIFEST.md`

Decision authority:
**Taylor Cheaney** (storage policy adopted for TracktaOS/Ori Live Readiness track)

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Config changed:** **No** · **`.env` changed:** **No** · **Secret inspected:** **No** · **Secret printed/logged:** **No** · **process.env dumped:** **No** · **Runtime processes started:** **No** · **Real RPC broadcast used:** **No** · **Arming authorized:** **No** · **`liveArmed` true set:** **No** · **`FOMO_ENABLE_LIVE_SUBMISSION` set:** **No** · **Micro-live execution authorized:** **No** · **Capital exposure enabled:** **No**

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `R15 SECURE STORAGE DECISION — 2026-07-06.md` | Authorizations/ linkage; ONE_SESSION_ONLY; RB-G9 TBD |
| `MICRO-LIVE RUNBOOK CONSOLIDATION — 2026-07-05.md` | §5.3 post-trade · §5.5 RB-G9 template |
| `RUNBOOK DOCUMENTATION UPDATE — 2026-07-06.md` | RB-G9 gap; gate separation |
| `A1-D04 RECONCILIATION DRILL EXECUTION — 2026-07-06.md` | D4-9 manual capture; linkage fields |
| `A1-D05 AUDIT DURABILITY DRILL EXECUTION — 2026-07-06.md` | Audit/reconciliation/RB-G9 correlation pattern |
| `LIVE SUBMISSION PATH READINESS REVIEW — 2026-07-06.md` | N7 RB-G9 blocker |
| `REAL RPC NO-BROADCAST READINESS CHECK — 2026-07-06.md` | Prerequisite linkage |
| `analysis/a1_d04_rb_g9_manual_capture.json` | Fixture drill capture shape (non-canonical) |
| `ACTIVE_MANIFEST.md` | Runtime audit paths; analysis/ gitignore patterns |
| `Authorizations/README.md` | R15 secure storage index |
| `Live Readiness/` folder structure | Gate receipts vs session evidence separation |

---

## 2. Decision Summary

| Item | Decision |
|------|----------|
| **Canonical RB-G9 storage** | `Ori/Phase 2/Project Vulcan/Live Readiness/Sessions/` |
| **Rejected alternative** | `Post-Trade Reviews/` — too narrow; RB-G9 also covers aborted armed sessions, halts, ambiguity, and no-trade armed sessions |
| **Folder/index created** | **Yes** — `Sessions/README.md` + `_templates/` (documentation only; no live session records) |
| **Per-session layout** | `Sessions/SESSION — {sessionId} — {YYYY-MM-DD}/` |
| **Human record (required)** | `RB-G9 — REVIEW.md` |
| **Machine sidecar (recommended)** | `rb_g9_record.json` in same session folder |
| **Fixture drill captures** | Remain in `analysis/` — **non-canonical**; future live sessions use `Sessions/` |
| **Runtime audit tails** | `execution_audit.jsonl` / `pending_reconciliation.jsonl` at runtime root — RB-G9 **links** via secret-free cross-refs only |

---

## 3. Canonical Storage Location

### 3.1 Primary — Ori Sessions (secret-free, git-tracked)

```
Ori/Phase 2/Project Vulcan/Live Readiness/Sessions/
  README.md
  _templates/
    RB-G9-REVIEW-TEMPLATE.md
    rb_g9_record.example.json
  SESSION — {sessionId} — {YYYY-MM-DD}/     ← created only when trigger fires (future)
    RB-G9 — REVIEW.md
    rb_g9_record.json                         ← optional but recommended
```

**Session ID format:** `RB-G9-{YYYYMMDD}-{slug}`  
**Examples:** `RB-G9-20260706-EV01` · `RB-G9-20260706-ABORT01` · `RB-G9-20260706-ESTOP01`

### 3.2 Relationship to other storage layers

| Layer | Path | Role |
|-------|------|------|
| **Signed authorizations** | `Authorizations/` | R13 · R15 · arming · execution auth — **prerequisite links** |
| **RB-G9 session evidence** | `Sessions/` | Post-session operator review + structured outcome |
| **Runtime machine audit** | repo root / runtime root | `execution_audit.jsonl` · `pending_reconciliation.jsonl` — durability per A1; RB-G9 references, does not replace |
| **Fixture drill evidence** | `analysis/` | e.g. `a1_d04_rb_g9_manual_capture.json` — drill-only; points to `structuredStoragePath: Sessions/` when live |

### 3.3 Update to runbook §5.5 placeholder

The consolidated runbook §5.5 “Structured storage path: TBD” is **superseded** by this decision. Operators use `Sessions/_templates/RB-G9-REVIEW-TEMPLATE.md` for future live sessions. Runbook file edit deferred to optional future runbook gate.

---

## 4. RB-G9 Required Fields

Every RB-G9 record (markdown + sidecar when present) **must** capture:

| Category | Fields |
|----------|--------|
| **Identity** | `sessionId` · `gateId` · session date · operator · review completed timestamp |
| **Linked authorizations** | R13 sign-off path · R15 authorization path · arming authorization path · micro-live execution authorization path · execution receipt path |
| **Linked readiness receipts** | Signer placement · real RPC no-broadcast · other applicable gate receipts |
| **Trade / route** | token/pair · entry/exit timestamps · route/quote metadata (secret-free) · position size · slippage · price impact · fees · PnL if any |
| **Signatures** | transaction signature(s) — **only after actual future broadcast** |
| **Operational** | reconciliation status · ambiguity status/classes · e-stop status · stop/halt reason · position write confirmed |
| **Governance** | OR status · live readiness claim status · strategy readiness claim status · capital exposure status |
| **R15 closure** | ONE_SESSION_ONLY expiry acknowledgment · continue/halt decision |
| **Operator** | engineering-validation notes — **no edge/profitability claim** |
| **Runtime cross-refs** | audit tail ref · pending reconciliation ref (IDs/counts only) |

---

## 5. Structured Schema Decision

| Component | Decision |
|-----------|----------|
| **Human review** | Markdown template: `Sessions/_templates/RB-G9-REVIEW-TEMPLATE.md` → copied to `RB-G9 — REVIEW.md` per session |
| **Machine sidecar** | Optional JSON: `rb_g9_record.json` — schema v1 exemplified in `_templates/rb_g9_record.example.json` |
| **Canonical when both exist** | Markdown is **operator-authoritative** for attestation; JSON is **machine-parseable mirror** — fields must agree |
| **Secret-free** | **Required** — see §6 |
| **Fixture drills** | May continue writing to `analysis/` for test evidence; live sessions **must** use `Sessions/` |

**Sidecar minimum keys:** `schemaVersion` · `recordType` · `sessionId` · `reviewState` · `linkedRecords` · `trade` · `operational` · `governance` · `r15OneSessionOnly` · `secretSafe: true`

---

## 6. Secret-Free Requirements

| Allowed | Forbidden |
|---------|-----------|
| Public wallet address | Private keys · seed phrases |
| Transaction signature *(post-broadcast only)* | Raw `.env` values |
| Redacted route/quote summaries | Full RPC URLs with credentials |
| Provider labels (`helius_rpc_url_configured`) | API keys in any field |
| Audit/reconciliation **references** (positionId, row count, stage name) | Full `process.env` dumps |
| Lamport/SOL amounts | Screenshots with secrets |
| Relative Ori paths | Copying signer secret JSON into sidecar |

---

## 7. Post-Trade Review States

Exactly one **primary** `reviewState` per RB-G9 record:

| State | Meaning |
|-------|---------|
| **`COMPLETE_CLEAN`** | Session ended; trade(s) reconciled; no ambiguity; no e-stop; within caps |
| **`COMPLETE_WITH_LOSS`** | Session ended with realized loss within or hitting loss caps; reconciled |
| **`HALTED`** | Operator or policy halt before normal completion (not e-stop, not ambiguity-only) |
| **`AMBIGUOUS_RECONCILIATION_REQUIRED`** | Pending reconciliation or ambiguity class observed; entries blocked until resolved |
| **`ESTOP_TRIGGERED`** | `emergencyStop` activated; no further submit until reset + review |
| **`ABORTED_BEFORE_BROADCAST`** | Armed or authorized path started but **no transaction broadcast** occurred |
| **`NO_TRADE_EXECUTED`** | Session ended with arming/authorization activity but zero trades (e.g. disarm without submit) |

**Secondary tags** (optional array): `REALIZED_SLIPPAGE_HALT` · `LOSS_CAP_REACHED` · `POSTURE_DRIFT` · `G3_OVERRIDE_ATTEMPTED`

---

## 8. Creation Triggers — When RB-G9 Record Must Be Created

An RB-G9 session folder **must** be created when any of the following occur in a **future authorized** engineering-validation context:

| Trigger | Minimum `reviewState` |
|---------|------------------------|
| Any future micro-live execution (trade attempted or completed) | `COMPLETE_*` · `HALTED` · `AMBIGUOUS_*` · `ESTOP_*` as applicable |
| Any future aborted armed session (disarm before/during without broadcast) | `ABORTED_BEFORE_BROADCAST` or `NO_TRADE_EXECUTED` |
| Any halt during authorized session | `HALTED` |
| Any e-stop activation | `ESTOP_TRIGGERED` |
| Any ambiguity or reconciliation event requiring operator review | `AMBIGUOUS_RECONCILIATION_REQUIRED` |
| Any no-trade session where arming occurred (`liveArmed true` was reached, even briefly) | `NO_TRADE_EXECUTED` |

**Not required today** — no authorized session has occurred. Templates exist for future gates only.

---

## 9. R15 `ONE_SESSION_ONLY` Linkage

| Rule | Requirement |
|------|-------------|
| **Session closure** | Completing RB-G9 review **closes** the active R15 `ONE_SESSION_ONLY` authorization for that session |
| **Expiry** | R15 authorization is **expired** after RB-G9 record is filed with `r15OneSessionOnly.authorizationExpiredByReview: true` (or equivalent markdown attestation) |
| **No second session** | Operator **must not** start a second engineering-validation session without: (1) filed RB-G9 for prior session, (2) new signed R15 authorization in `Authorizations/`, (3) updated runtime stub if executor checks apply |
| **Ambiguity/halt/e-stop** | RB-G9 filing still required — authorization expires even if state is `AMBIGUOUS_*` · `ESTOP_*` · `ABORTED_*` |
| **Reauthorization** | New `AUTHORIZATION — R15 Micro-Live Session — YYYY-MM-DD.md` must reference prior RB-G9 session path |

**Invariant:** ONE_SESSION_ONLY authorization ≠ RB-G9 complete until RB-G9 record exists for that session.

---

## 10. Cursor Run Log Reference Rule

| Rule | Detail |
|------|--------|
| **One row per gate** | Each gate appends exactly one row |
| **Link RB-G9 record** | When a session RB-G9 record is created, the gate row **Outcomes** includes `Sessions/SESSION — {sessionId} — {YYYY-MM-DD}/` |
| **Review state** | Include primary `reviewState` label — no trade details requiring secrets |
| **No secrets** | Never paste keys, RPC URLs, env values, or signer material |
| **No raw env** | Booleans/labels only |
| **OR posture** | State `OR-20260630-008 not_promoted` unless OR Promotion gate changes it |
| **Linkage to Authorizations** | When session closes R15 scope, row notes authorization expired — not renewed in same row unless separate R15 gate |

---

## 11. Folder / Index Created

| Item | Created |
|------|---------|
| `Sessions/README.md` | **Yes** |
| `Sessions/_templates/RB-G9-REVIEW-TEMPLATE.md` | **Yes** |
| `Sessions/_templates/rb_g9_record.example.json` | **Yes** |
| Live session folders | **No** — none authorized yet |

**Authorizations index update:** Post-trade row in `Authorizations/README.md` now resolves to `Sessions/` per this decision *(cross-reference only)*.

---

## 12. Remaining Blockers (After This Decision)

| Blocker | Status |
|---------|--------|
| Real transaction broadcast | **Unproven** — execution gate only |
| Production-root proofs | **Deferred** |
| Final pre-arming guard transition plan | **Open** |
| Safety suite re-run before arming | **Open** |
| R15 session authorization signed on disk | **Not yet** |
| Arming Authorization Gate | **Not authorized** |
| Micro-Live Execution Authorization | **Not authorized** |
| Strategy readiness (LR-02/R7b · LR-03) | **NOT READY** |
| G3 manual override ack surface | **Disabled** — must stay disabled |

**Closed by this gate:** N7 RB-G9 structured storage path · schema · states · triggers · R15 linkage · Cursor Run Log rule.

---

## 13. Explicit Non-Authorizations (This Gate)

| Item | Status |
|------|--------|
| Arming / `liveArmed true` | **No** |
| Micro-live execution | **No** |
| Capital exposure | **No** |
| Live session RB-G9 record created | **No** — templates only |
| OR promotion | **No** |
| Live / soak / strategy readiness claims | **No** |
| Code / config / `.env` modified | **No** |

---

## 14. Recommended Next Gate

**Final Pre-Arming Guard Transition Plan**

---

## 15. Safety Confirmation

| Item | Value |
|------|-------|
| `SOLANA_SIGNER_SECRET` printed/logged | **No** |
| `.env` opened for editing | **No** |
| `executionMode LIVE` set | **No** |
| `dryRunMode false` set | **No** |
| `liveArmed true` set | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` set | **No** |
| `FOMO_ENABLE_LIVE_SUBMISSION` set | **No** |
| Runtime loops started | **No** |
| Real RPC broadcast used | **No** |

---

Receipt path:
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md`

Index path:
`Ori/Phase 2/Project Vulcan/Live Readiness/Sessions/README.md`
