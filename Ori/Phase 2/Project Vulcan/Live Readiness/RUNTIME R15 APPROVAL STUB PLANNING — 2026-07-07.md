# Runtime R15 Approval Stub Planning — 2026-07-07

Status:
**Planning complete — runtime stub schema, creation procedure, validation, expiration, and rollback documented; stub not created; system remains ARMED ONLY**

Gate type:
Planning / documentation — runtime R15 approval stub design only (armed posture preserved)

Prerequisites:
`ARMING TRANSITION EXECUTION GATE — 2026-07-07.md` · `Authorizations/AUTHORIZATION — R15 … — 2026-07-06.md` · `Authorizations/AUTHORIZATION — Arming — 2026-07-07.md` · `R15 SECURE STORAGE DECISION — 2026-07-06.md` · `RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md`

Review date:
**2026-07-07**

Live readiness achieved:
**No**

Micro-live execution authorized:
**No**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Config changed:** **No** · **`.env` changed:** **No** · **Runtime stub created:** **No** · **Session folder created:** **No** · **Loops started:** **No** · **Submit/broadcast:** **No** · **Capital exposure enabled:** **No**

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `ARMING TRANSITION EXECUTION GATE — 2026-07-07.md` | Armed posture · stub absent · BUY blocked |
| `Authorizations/AUTHORIZATION — R15 … — 2026-07-06.md` | Canonical signed session scope |
| `Authorizations/AUTHORIZATION — Arming — 2026-07-07.md` | Stub not created in arming transition |
| `R15 SECURE STORAGE DECISION — 2026-07-06.md` | Canonical vs runtime stub rules |
| `RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md` | Session evidence linkage |
| `FINAL PRE-ARMING GUARD TRANSITION PLAN — 2026-07-06.md` | Submit-time guard reference |
| `MICRO-LIVE RUNBOOK CONSOLIDATION — 2026-07-05.md` | Runbook caps · gate separation |
| `live_executor.js` | `loadMicroLiveApprovalRecord` · `assertMicroLiveApprovalRecord` · `assertLivePathPreSubmit` |
| `r15_manual_approval_check.js` | `normalizeRecord` · `validateApprovalRecord` · `APPROVAL_STATUSES` |
| `test_r15_manual_approval_check.js` | Fixture record shape · validation behavior |
| `test_r16_live_path_coupling.js` | BUY blocked without stub |
| `examples/r15_manual_approval_record.example.json` | Legacy example *(not submit-valid as-is)* |
| `.gitignore` | `analysis/` gitignored (includes stub path) |
| `ACTIVE_MANIFEST.md` | Stub path documentation |

---

## 2. Runtime Stub Path

**Path:** `analysis/r15_manual_approval_record.json`

**Loader reference:** `live_executor.js` → `getMicroLiveApprovalRecordPath()` → `path.join(ROOT, "analysis", "r15_manual_approval_record.json")`

---

## 3. Canonical vs Runtime Record Distinction

| Layer | Path | Role |
|-------|------|------|
| **Canonical (human-signed)** | `Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — 2026-07-06.md` | **Source of truth** — Taylor signed · git-tracked · secret-free |
| **Runtime stub (machine-readable)** | `analysis/r15_manual_approval_record.json` | **Non-canonical mirror** — gitignored · executor input only |
| **Status output (read-only helper)** | `analysis/r15_manual_approval_status.json` | **Non-canonical** — output of `r15_manual_approval_check.js` |

**Rules:**

- Runtime stub is **never** a substitute for the signed Ori authorization.
- Stub must be populated **only** from signed R15 metadata — no secrets · no RPC credentials · no raw env values.
- Stub creation **does not** authorize micro-live execution.
- Separate **Micro-Live Execution Authorization** and **Execution** gates remain required after stub creation.

---

## 4. Actual Loader Schema (Submit-Time Enforcement)

Submit-time enforcement for BUY is implemented in `live_executor.js` → `assertMicroLiveApprovalRecord(cfg)` (called from `assertLivePathPreSubmit` for `kind === "BUY"`).

**Enforcement pipeline:**

1. Load file → `JSON.parse` → `r15_manual_approval_check.normalizeRecord(raw)`
2. Apply checks below — any failure throws `MICRO_LIVE_APPROVAL_BLOCKED`

### 4.1 Enforced fields (submit-time — `assertMicroLiveApprovalRecord`)

| Field | Requirement | Source in JSON |
|-------|-------------|----------------|
| **File present** | Must exist at `analysis/r15_manual_approval_record.json` | — |
| **`approvalId`** | Non-empty string | top-level |
| **`operatorName`** | Non-empty string | top-level |
| **`dateTime`** | Non-empty string | top-level |
| **`operatorSignaturePresent`** | Must be `true` | top-level |
| **`finalApprovalStatus`** | Must equal **`APPROVED FOR ONE MICRO-LIVE SESSION ONLY`** | top-level *(exact string from `APPROVAL_STATUSES.ONE_SESSION_ONLY`)* |
| **`acknowledgments.totalLossRiskAcknowledged`** | `true` | nested |
| **`acknowledgments.slippageCapAcknowledged`** | `true` | nested |
| **`acknowledgments.mevProtectionPlanAcknowledged`** | `true` | nested |
| **`acknowledgments.emergencyStopPolicyAcknowledged`** | `true` | nested |
| **`acknowledgments.noAutoCompoundingAcknowledged`** | `true` | nested |
| **`acknowledgments.noAveragingDownAcknowledged`** | `true` | nested |
| **`acknowledgments.noUnattendedExecutionAcknowledged`** | `true` | nested |
| **`acknowledgments.liveTradingNotForIncomeAcknowledged`** | `true` | nested |
| **`researchWalletPublicAddress`** | Must match `live_config.json` `walletPublicAddress` when both set | top-level |

### 4.2 Normalized but NOT enforced at submit-time (informational / other layers)

These fields are parsed by `normalizeRecord()` but **not** checked by `assertMicroLiveApprovalRecord()`:

| Field | Normalized key | Classification |
|-------|----------------|----------------|
| `sessionStartTime` / `sessionEndTime` | same | **Informational** |
| `limits.*` / flat limit fields | `authorizedSessionAllocationSol`, `maxFirstTradeSizeSol`, `maxSessionLoss`, `maxDailyLoss`, `maxWeeklyLoss`, `maxOpenPositions`, `maxTradesThisSession`, `maxTradesPerDay` | **Informational at submit** — enforced elsewhere (R14 config, runbook) or by **`validateApprovalRecord`** in status helper only |
| `perTradeApprovalRequired` | same | **Informational** |
| `acknowledgments.r7bBypassRiskAcknowledged` | same | **Informational at submit** — enforced by `validateApprovalRecord` in status helper when R7b unmet |
| `totalWalletBalance` | same | **Informational** |

### 4.3 Future enhancement fields (not validated by current loader — do not rely on enforcement)

| Proposed field | Classification | Notes |
|----------------|----------------|-------|
| `schemaVersion` | **Future enhancement** | Not read by loader |
| `signedRecordPath` | **Future enhancement** *(recommended informational)* | Cross-check at creation gate only |
| `sessionId` | **Future enhancement** *(recommended informational)* | e.g. `RB-G9-20260706-EV01` — not read by loader |
| `validUntil` / `expiresAt` | **Future enhancement** | Not read by loader — expiry enforced by governance + session ops |
| `purpose` | **Future enhancement** *(recommended informational)* | e.g. `engineering_validation_only` |
| `consumed` / `expired` | **Future enhancement** | Removal/disable is operational — loader does not read |
| `maxSlippageBps` | **Future enhancement** | Slippage enforced via R14/`live_config.json`, not stub |
| `g3OverrideDisabled` | **Future enhancement** | G3 enforced by runbook + R14 path, not stub field |
| `noScaling` | **Future enhancement** *(recommended informational)* | Governance marker |

**Important:** `r15_manual_approval_check.validateApprovalRecord()` applies additional rules (allocation ≤ micro limits, R7b bypass ack) but is used by the **status helper**, not by `assertMicroLiveApprovalRecord` at BUY submit. For engineering-validation stub, still populate limits within signed R15 bounds so status helper and operator review stay aligned.

---

## 5. Recommended Stub JSON Shape (future creation gate)

Minimal **submit-valid** stub aligned to signed R15 `RB-G9-20260706-EV01`:

```json
{
  "approvalId": "RB-G9-20260706-EV01",
  "operatorName": "Taylor Cheaney",
  "dateTime": "2026-07-06T00:00:00.000Z",
  "sessionStartTime": null,
  "sessionEndTime": null,
  "researchWalletPublicAddress": "FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6",
  "finalApprovalStatus": "APPROVED FOR ONE MICRO-LIVE SESSION ONLY",
  "operatorSignaturePresent": true,
  "limits": {
    "authorizedSessionAllocationSol": 0.005,
    "maxFirstTradeSizeSol": 0.005,
    "maxSessionLoss": 0.03,
    "maxDailyLoss": 0.03,
    "maxOpenPositions": 1,
    "maxTradesThisSession": 1,
    "maxTradesPerDay": 1
  },
  "acknowledgments": {
    "r7bBypassRiskAcknowledged": true,
    "totalLossRiskAcknowledged": true,
    "slippageCapAcknowledged": true,
    "mevProtectionPlanAcknowledged": true,
    "emergencyStopPolicyAcknowledged": true,
    "noAutoCompoundingAcknowledged": true,
    "noAveragingDownAcknowledged": true,
    "noUnattendedExecutionAcknowledged": true,
    "liveTradingNotForIncomeAcknowledged": true
  },
  "oriLinkage": {
    "signedRecordPath": "Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — 2026-07-06.md",
    "sessionId": "RB-G9-20260706-EV01",
    "validUntil": "2026-07-20",
    "purpose": "engineering_validation_only",
    "noScaling": true,
    "g3OverrideDisabled": true,
    "maxSlippageBps": 100,
    "schemaVersion": 1
  }
}
```

**Note:** `oriLinkage` block is **informational only** — not enforced by current submit loader. **`maxFirstTradeSizeSol: 0.005`** aligns with signed R15 (0.01 SOL **not authorized**). **`validateApprovalRecord`** micro limits allow up to 0.01 trade / 0.05 allocation — stub should use **tighter signed values**, not generic micro-limit ceiling.

---

## 6. Cross-Check Rules (future creation gate — operator/script)

| Rule | Enforced by loader? | Creation-gate check |
|------|---------------------|---------------------|
| Stub session ID matches signed R15 | **No** | **Yes** — `approvalId` / `oriLinkage.sessionId` = `RB-G9-20260706-EV01` |
| Signed record path exists | **No** | **Yes** — file present under `Authorizations/` |
| Signer/date match signed record | **Partial** — `operatorName` + `dateTime` required non-empty | **Yes** — Taylor Cheaney · 2026-07-06 |
| Public address matches config/signer | **Yes** | **Yes** — `FXLGxPo4…` |
| Expiry ≤ signed R15 unused expiry | **No** | **Yes** — `validUntil` ≤ `2026-07-20` |
| Position size 0.005 SOL | **No** *(config enforces)* | **Yes** — `maxFirstTradeSizeSol: 0.005` |
| 0.01 SOL not authorized | **No** | **Yes** — must not set `maxFirstTradeSizeSol` > 0.005 |
| G3 disabled | **No** | **Yes** — informational marker; config/runbook must stay disabled |
| Max trades = 1 | **No** | **Yes** — `maxTradesThisSession: 1` |
| ONE_SESSION_ONLY status string | **Yes** | **Yes** — exact `APPROVED FOR ONE MICRO-LIVE SESSION ONLY` |
| No secrets / RPC / raw env in JSON | **N/A** | **Yes** — secret scan before write |
| File gitignored | **N/A** | **Yes** — under `analysis/` |

---

## 7. Future Creation Procedure (Gate: Runtime R15 Approval Stub Creation — not this gate)

| Step | Action |
|------|--------|
| **1** | Confirm signed R15 + Arming Authorization valid · R15 unused · before 2026-07-20 |
| **2** | Confirm armed posture intentional · micro-live execution **not** authorized yet |
| **3** | Build JSON from signed R15 metadata only (§5 template) |
| **4** | Secret scan stub JSON — reject if key-like patterns / env values |
| **5** | Run cross-checks (§6) |
| **6** | Write `analysis/r15_manual_approval_record.json` *(gitignored)* |
| **7** | Run **no-submit probes only:** |
| | `node -e "… __r16LivePathTest.assertMicroLiveApprovalRecord(cfg) …"` → expect **PASS** |
| | `node -e "… __r16LivePathTest.assertLivePathPreSubmit(cfg,{kind:'BUY',…}) …"` → may pass R15 gate but **still must not invoke submit** |
| **8** | Confirm **no** `enterPosition` · **no** loop · **no** broadcast |
| **9** | Write creation gate receipt · link canonical R15 path |
| **10** | **Stop** — stub creation alone does not authorize micro-live execution |

**Forbidden in creation gate:** loops · submit · broadcast · position · capital · `FOMO_ALLOW_LOOP_LIVE=YES` · G3 enable · 0.01 SOL authorization

---

## 8. Activation Boundaries

| Action | Authorized by stub creation alone? |
|--------|-----------------------------------|
| Pass `assertMicroLiveApprovalRecord` at BUY guard | **Yes** *(if stub valid)* |
| Pass full `assertLivePathPreSubmit` for BUY | **Partial** — removes R15 missing blocker; other guards still apply |
| Micro-Live Execution Authorization | **No** — separate signed gate required |
| Actual trade / broadcast | **No** — separate execution gate required |
| Scanner/executor `--loop` | **No** |
| Strategy deployment / scaling | **No** |
| Live/soak/strategy readiness claims | **No** |

**Invariant:** stub creation = machine-readable mirror only · **not** execution authorization.

---

## 9. Expiration / Consumption Behavior

Aligned with signed R15 + Arming Authorization expiration rules:

| Trigger | Stub / session handling |
|---------|-------------------------|
| R15 unused expiry (**2026-07-20**) | Stub must be removed/disabled; no new BUY |
| R15 consumed (one trade) | Remove/disable stub; RB-G9 required |
| Armed session ends (disarm) | Remove/disable stub; RB-G9 `NO_TRADE_EXECUTED` or `ABORTED_BEFORE_BROADCAST` |
| Ambiguity / halt / e-stop / posture drift | Halt · remove/disable stub · RB-G9 |
| Signer/public address change | Reauthorization required · old stub invalid |
| One armed session completed | R15 ONE_SESSION_ONLY consumed per policy |

**Operational rule:** After session closure, delete or rename stub (e.g. `r15_manual_approval_record.consumed.json`) and verify BUY blocked again.

---

## 10. Rollback / Removal Procedure

| Step | Action | Verification |
|------|--------|--------------|
| **1** | Delete or move `analysis/r15_manual_approval_record.json` | File absent |
| **2** | Run `assertMicroLiveApprovalRecord` probe | **BLOCKED** — "record missing" |
| **3** | Run BUY `assertLivePathPreSubmit` probe | **BLOCKED** at R15 gate |
| **4** | Confirm no transaction / position / capital | 0 open live · 0 pending |
| **5** | Preserve canonical signed Ori record | Do not delete `Authorizations/AUTHORIZATION — R15 …` |
| **6** | Optional: run `node r15_manual_approval_check.js` | Status reflects missing/invalid record |

**Disarm note:** Removing stub does **not** disarm. Full disarm still requires C1–C3 rollback per arming transition plan.

---

## 11. Future Stub Creation — Abort Criteria

Abort before write or revert immediately after:

| # | Condition |
|---|-----------|
| **A1** | Signed R15 invalid · expired · consumed |
| **A2** | Session ID mismatch vs `RB-G9-20260706-EV01` |
| **A3** | Signer/public address mismatch |
| **A4** | Schema missing enforced fields (§4.1) |
| **A5** | Wrong `finalApprovalStatus` string |
| **A6** | `maxFirstTradeSizeSol` > 0.005 or 0.01 authorized in stub |
| **A7** | Secrets / RPC credentials / raw env in JSON |
| **A8** | Stub path not under gitignored `analysis/` |
| **A9** | Micro-live execution attempted |
| **A10** | Submit / broadcast invoked |
| **A11** | Loop started |
| **A12** | Position / reconciliation / capital appears |
| **A13** | `assertMicroLiveApprovalRecord` probe fails after write |
| **A14** | G3 enabled or `FOMO_ALLOW_LOOP_LIVE=YES` |

---

## 12. Current Armed-Only Posture Verification (read-only — 2026-07-07)

| Check | Result |
|-------|--------|
| `liveArmed` | **`true`** |
| `operationalPosture` | **`LIVE_ARMED`** |
| Guard failures | **`[]`** |
| `FOMO_ALLOW_LOOP_LIVE` | unset |
| Runtime stub | **absent** |
| `assertMicroLiveApprovalRecord` | **BLOCKED** — "R15 manual approval record missing" |
| BUY `assertLivePathPreSubmit` | **BLOCKED** — same (R15 gate) |
| Open live positions | **0** |
| Pending reconciliation | **0** |
| Capital exposure | **none** |
| Loops running | **No** |
| Submit/broadcast | **No** |

**System remains armed:** **Yes** — ARMED ONLY · micro-live not authorized · stub absent · BUY still blocked

---

## 13. Explicit Non-Actions (This Gate)

| Item | Status |
|------|--------|
| Runtime stub created | **No** |
| Micro-live execution authorized | **No** |
| Config / `.env` modified | **No** |
| Disarm performed | **No** |
| Session folder created | **No** |
| OR promotion | **No** |
| Readiness/profitability claims | **No** |

---

## 14. Recommended Next Gate

**Runtime R15 Approval Stub Creation Authorization**

---

## 15. Safety Confirmation

| Item | Value |
|------|-------|
| `SOLANA_SIGNER_SECRET` inspected / printed | **No** |
| `process.env` dumped | **No** |
| `.env` modified | **No** |
| `live_config.json` modified | **No** |
| Production code modified | **No** |
| Runtime stub created | **No** |
| Submit path invoked | **No** |
| Real RPC broadcast used | **No** |
| OR-20260630-008 status | **not_promoted** |
| Capital exposure enabled | **No** |

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/RUNTIME R15 APPROVAL STUB PLANNING — 2026-07-07.md`
