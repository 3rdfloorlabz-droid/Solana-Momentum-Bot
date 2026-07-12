# RB-G9 Post-Session Review — TEMPLATE

**Status:** TEMPLATE ONLY — not a live session record  
**Record type:** RB-G9 structured post-session evidence  
**Review state:** *(one of: COMPLETE_CLEAN | COMPLETE_WITH_LOSS | HALTED | AMBIGUOUS_RECONCILIATION_REQUIRED | ESTOP_TRIGGERED | ABORTED_BEFORE_BROADCAST | NO_TRADE_EXECUTED)*

---

## 1. Session identity

| Field | Value |
|-------|-------|
| **Session ID** | `RB-G9-YYYYMMDD-…` |
| **Gate ID** | *(e.g. Micro-Live Execution — YYYY-MM-DD)* |
| **Session date (UTC)** | |
| **Operator** | Taylor Cheaney |
| **Review completed at** | |

---

## 2. Linked authorization & gate receipts

| Link | Relative path |
|------|---------------|
| R13 sign-off | `../../R13 SIGN-OFF GATE — 2026-07-06.md` |
| R15 session authorization | `../../Authorizations/AUTHORIZATION — R15 Micro-Live Session — YYYY-MM-DD.md` |
| Arming authorization | `../../Authorizations/AUTHORIZATION — Arming — YYYY-MM-DD.md` |
| Micro-live execution authorization | `../../Authorizations/AUTHORIZATION — Micro-Live Execution — YYYY-MM-DD.md` |
| Execution receipt | *(future gate receipt path)* |
| Signer placement | `../../SIGNER SECRET PLACEMENT EXECUTION — 2026-07-06.md` |
| Real RPC no-broadcast | `../../REAL RPC NO-BROADCAST READINESS CHECK — 2026-07-06.md` |

---

## 3. Trade / route metadata (secret-free)

| Field | Value |
|-------|-------|
| **Token / mint** | |
| **Pair / route label** | |
| **Entry timestamp (UTC)** | |
| **Exit timestamp (UTC)** | |
| **Transaction signature(s)** | *(only after actual broadcast)* |
| **Route / quote metadata** | *(redacted labels only — no API keys)* |
| **Position size (SOL)** | |
| **Realized slippage (bps)** | |
| **Price impact result (%)** | |
| **Fees / priority fee (lamports)** | |
| **PnL result (SOL)** | *(if any)* |

---

## 4. Operational status

| Field | Value |
|-------|-------|
| **Reconciliation status** | clean / pending / resolved / blocked |
| **Ambiguity status** | none / SUBMISSION_UNKNOWN / … |
| **E-stop status** | not triggered / triggered / reset pending |
| **Stop / halt reason** | |
| **Position write confirmed** | yes / no / n/a |
| **Capital exposure status** | `none` until separately authorized |

---

## 5. Governance posture (required)

| Field | Value |
|-------|-------|
| **OR-20260630-008** | `not_promoted` |
| **Live readiness claimed** | **No** |
| **Strategy readiness claimed** | **No** |
| **Profitability / edge claim** | **No** |

---

## 6. R15 ONE_SESSION_ONLY closure

| Field | Value |
|-------|-------|
| **R15 authorization expired by this review** | yes / n/a |
| **Second session authorized** | **No** — requires new signed R15 record |
| **Continue / halt decision** | |

---

## 7. Operator notes

*(Engineering-validation observations only — no edge or profitability claim.)*

---

## 8. Runtime cross-references (optional, secret-free)

| Field | Value |
|-------|-------|
| **Execution audit tail ref** | *(event count / last stage — not full dump)* |
| **Pending reconciliation ref** | *(positionId / row count)* |
| **Machine sidecar** | `./rb_g9_record.json` |
