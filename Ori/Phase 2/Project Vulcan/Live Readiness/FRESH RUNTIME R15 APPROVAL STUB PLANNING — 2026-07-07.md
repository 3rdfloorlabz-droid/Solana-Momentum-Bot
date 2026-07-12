# Fresh Runtime R15 Approval Stub Planning — 2026-07-07

Status:
**Planning complete — EV02 runtime stub schema, creation procedure, validation, expiration, rollback, and host-process safety preconditions documented; stub not created; system remains ARMED ONLY**

Gate type:
Planning / documentation — EV02 runtime R15 approval stub design only (armed posture preserved)

Prerequisites:
`ARMED-STATE EXECUTOR LOOP STOP GATE — 2026-07-07.md` · `FRESH ARMING TRANSITION EXECUTION GATE — 2026-07-07.md` · `Authorizations/AUTHORIZATION — R15 … RB-G9-20260707-EV02 — 2026-07-07.md` · `Authorizations/AUTHORIZATION — Arming — RB-G9-20260707-EV02 — 2026-07-07.md` · `R15 SECURE STORAGE DECISION — 2026-07-06.md` · `RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md`

Review date:
**2026-07-07**

Session:
**RB-G9-20260707-EV02**

R15 unused expiry:
**2026-07-14**

Live readiness achieved:
**No**

Micro-live execution authorized:
**No**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Config changed:** **No** · **`.env` changed:** **No** · **Runtime stub created:** **No** · **Executor loop running:** **No** · **Submit/broadcast:** **No** · **Capital exposure enabled:** **No**

---

## 1. Files inspected (read-only)

| File | Purpose |
|------|---------|
| `ARMED-STATE EXECUTOR LOOP STOP GATE — 2026-07-07.md` | Stale loop stopped · no replacement process |
| `ARMED-STATE PROCESS ISOLATION VERIFICATION — 2026-07-07.md` | Host-process isolation findings |
| `FRESH ARMING TRANSITION EXECUTION GATE — 2026-07-07.md` | EV02 armed posture · stub absent |
| `Authorizations/AUTHORIZATION — R15 … RB-G9-20260707-EV02 — 2026-07-07.md` | Canonical signed EV02 session scope |
| `Authorizations/AUTHORIZATION — Arming — RB-G9-20260707-EV02 — 2026-07-07.md` | Stub not created in arming transition |
| `RUNTIME R15 APPROVAL STUB PLANNING — 2026-07-07.md` | EV01 template *(consumed chain)* |
| `RUNTIME R15 APPROVAL STUB CREATION AUTHORIZATION — 2026-07-07.md` | EV01 auth pattern |
| `RUNTIME R15 APPROVAL STUB CREATION GATE — 2026-07-07.md` | EV01 creation gate pattern |
| `R15 SECURE STORAGE DECISION — 2026-07-06.md` | Canonical vs runtime stub rules |
| `RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md` | Session evidence linkage |
| `live_executor.js` | `loadMicroLiveApprovalRecord` · `assertMicroLiveApprovalRecord` · `assertLivePathPreSubmit` |
| `r15_manual_approval_check.js` | `normalizeRecord` · `validateApprovalRecord` · `APPROVAL_STATUSES` |
| `test_r15_manual_approval_check.js` | Fixture record shape |
| `test_r16_live_path_coupling.js` | BUY blocked without stub |
| `.gitignore` | `analysis/` gitignored |

---

## 2. Runtime stub path

**Path:** `analysis/r15_manual_approval_record.json`

**Loader reference:** `live_executor.js` → `getMicroLiveApprovalRecordPath()` → `path.join(ROOT, "analysis", "r15_manual_approval_record.json")`

**Gitignore:** **Yes** — entire `analysis/` directory is gitignored (`.gitignore` line 49)

---

## 3. Canonical vs runtime distinction

| Layer | Path | Role |
|-------|------|------|
| **Canonical (human-signed)** | `Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — RB-G9-20260707-EV02 — 2026-07-07.md` | **Source of truth** — Taylor signed · git-tracked · secret-free |
| **Runtime stub (machine-readable)** | `analysis/r15_manual_approval_record.json` | **Non-canonical mirror** — gitignored · executor input only |
| **Status output (read-only helper)** | `analysis/r15_manual_approval_status.json` | **Non-canonical** — output of `r15_manual_approval_check.js` |

**Rules:**

- Runtime stub is **never** a substitute for the signed Ori authorization.
- Stub must be populated **only** from signed EV02 R15 metadata — no private keys · no secrets · no RPC credentials · no raw environment values.
- Stub creation **does not** authorize micro-live execution · candidate selection · final per-trade confirmation · submit · broadcast · or loops.
- Separate **Fresh Runtime R15 Approval Stub Creation Authorization** → **Creation Gate** → **Micro-Live Execution Authorization** gates remain required.

---

## 4. Actual loader schema (submit-time enforcement)

Submit-time enforcement for BUY is implemented in `live_executor.js` → `assertMicroLiveApprovalRecord(cfg)` (called from `assertLivePathPreSubmit` when `kind === "BUY"`).

**Enforcement pipeline:**

1. Load file → `JSON.parse` → `r15_manual_approval_check.normalizeRecord(raw)`
2. Apply checks below — any failure throws `MICRO_LIVE_APPROVAL_BLOCKED`

### 4.1 Loader-enforced fields (`assertMicroLiveApprovalRecord`)

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

### 4.2 Informational / audit fields (normalized but not enforced at submit-time)

| Field | Classification |
|-------|----------------|
| `sessionStartTime` / `sessionEndTime` | **Informational** |
| `limits.*` / flat limit fields | **Informational at submit** — enforced via R14/`live_config.json` and runbook; `validateApprovalRecord` in status helper only |
| `perTradeApprovalRequired` | **Informational** |
| `acknowledgments.r7bBypassRiskAcknowledged` | **Informational at submit** — status helper when R7b unmet |
| `totalWalletBalance` | **Informational** |
| `oriLinkage.*` | **Informational / audit linkage** — creation-gate cross-check only |

### 4.3 Future enhancement fields (not validated by current loader)

| Field | Notes |
|-------|-------|
| `schemaVersion` | Not read by loader |
| `oriLinkage.signedRecordPath` | Recommended at creation gate |
| `oriLinkage.sessionId` | Recommended — `RB-G9-20260707-EV02` |
| `oriLinkage.validUntil` | Recommended — `2026-07-14`; loader does not enforce expiry |
| `oriLinkage.purpose` | Recommended — `engineering_validation_only` |
| `consumed` / `expired` | Operational removal only |
| `maxSlippageBps` / `g3OverrideDisabled` / `noScaling` | Informational markers; enforced elsewhere |

**Note:** `validateApprovalRecord()` in `r15_manual_approval_check.js` applies additional rules for the **status helper** only — not at BUY submit via `assertMicroLiveApprovalRecord`.

---

## 5. Recommended EV02 stub JSON shape (future creation gate only)

Minimal **submit-valid** stub aligned to signed EV02 R15:

```json
{
  "approvalId": "RB-G9-20260707-EV02",
  "operatorName": "Taylor Cheaney",
  "dateTime": "2026-07-07T00:00:00.000Z",
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
    "signedRecordPath": "Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — R15 ENGINEERING-VALIDATION ONE_SESSION_ONLY — RB-G9-20260707-EV02 — 2026-07-07.md",
    "armingRecordPath": "Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Arming — RB-G9-20260707-EV02 — 2026-07-07.md",
    "sessionId": "RB-G9-20260707-EV02",
    "validUntil": "2026-07-14",
    "purpose": "engineering_validation_only",
    "noScaling": true,
    "g3OverrideDisabled": true,
    "maxSlippageBps": 100,
    "mevRouteMode": "public_micro_live_only",
    "schemaVersion": 1
  }
}
```

**Forbidden in stub JSON:** private keys · `SOLANA_SIGNER_SECRET` · RPC URLs/API keys · raw `.env` values · credentials of any kind.

---

## 6. EV02 cross-check rules (future creation gate)

| Rule | Loader-enforced? | Creation-gate check |
|------|------------------|---------------------|
| Session ID = `RB-G9-20260707-EV02` | **No** | **Yes** — `approvalId` / `oriLinkage.sessionId` |
| Signed EV02 R15 record exists | **No** | **Yes** — canonical path present |
| Signed EV02 Arming record exists | **No** | **Yes** — linked arming auth |
| Signer = Taylor Cheaney | **Partial** — `operatorName` non-empty | **Yes** — must match signed record |
| Signature date = 2026-07-07 | **Partial** — `dateTime` non-empty | **Yes** — must match signed R15 date |
| Public address matches config/signer evidence | **Yes** | **Yes** — `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` |
| `validUntil` ≤ **2026-07-14** | **No** | **Yes** |
| Max one trade | **No** | **Yes** — `maxTradesThisSession: 1` |
| Approved position size **0.005 SOL** | **No** *(config)* | **Yes** — `maxFirstTradeSizeSol: 0.005` |
| **0.01 SOL not authorized** | **No** | **Yes** — must not exceed 0.005 in stub limits |
| G3 disabled | **No** | **Yes** — informational marker + config/runbook |
| No scaling | **No** | **Yes** — `oriLinkage.noScaling: true` |
| MEV mode `public_micro_live_only` | **No** | **Yes** — informational · config `mevRouteMode` |
| ONE_SESSION_ONLY status string | **Yes** | **Yes** — exact `APPROVED FOR ONE MICRO-LIVE SESSION ONLY` |
| No secrets / RPC / raw env | **N/A** | **Yes** — secret scan before write |
| File gitignored | **N/A** | **Yes** — under `analysis/` |
| EV01 session/auth not reused | **N/A** | **Yes** — no `RB-G9-20260706-EV01` references |

---

## 7. Host-process safety preconditions (future creation gate)

Learned from **Armed-State Process Isolation Verification** and **Executor Loop Stop Gate**:

| Precondition | Requirement |
|--------------|-------------|
| **No `live_executor.js --loop` process** | **Mandatory** — 0 executor loop PIDs before stub write |
| **No replacement/child executor process** | **Mandatory** — re-scan after any gate step |
| **`monitor.js` / scanner `--watch`** | **May remain** only if still demonstrably isolated (paper/observation-only · no live submit path) |
| **No process restart in creation gate** | **Mandatory** — creation uses no-submit probes in fresh short-lived `node -e` only |
| **Stale env loop lesson** | Long-running executor inherits `.env` at start — **never** create stub while a stale loop is running |

**Abort if:** any `live_executor.js --loop` detected immediately before or after stub write.

---

## 8. Future creation procedure (Fresh Runtime R15 Approval Stub Creation Gate — not this gate)

| Step | Action |
|------|--------|
| **1** | Confirm signed EV02 R15 + EV02 Arming Authorization valid · R15 unused · before **2026-07-14** |
| **2** | Confirm armed posture intentional · micro-live execution **not** authorized |
| **3** | **Host-process scan:** 0 `live_executor.js --loop` · monitor/scanner isolated |
| **4** | Build JSON from signed EV02 R15 metadata only (§5 template) |
| **5** | Secret scan stub JSON — reject key-like patterns / env values / RPC credentials |
| **6** | Run EV02 cross-checks (§6) |
| **7** | Verify `analysis/` gitignored |
| **8** | Write `analysis/r15_manual_approval_record.json` |
| **9** | Run **no-submit probes only:** |
| | `assertMicroLiveApprovalRecord(cfg)` → expect **PASS** |
| | `assertLivePathPreSubmit(cfg, { kind: 'BUY', … })` → R15 gate cleared · **must not invoke submit** |
| **10** | Confirm **no** loop · **no** `enterPosition` · **no** broadcast · **no** position · **no** capital |
| **11** | Write creation gate receipt · link canonical EV02 R15 path |
| **12** | **Stop** — stub creation alone does not authorize micro-live execution |

**Forbidden in creation gate:** loops · submit · broadcast · position · capital · `FOMO_ALLOW_LOOP_LIVE=YES` · G3 enable · 0.01 SOL authorization · OR promotion

---

## 9. Activation boundaries

| Action | Authorized by stub creation alone? |
|--------|-----------------------------------|
| Pass `assertMicroLiveApprovalRecord` at BUY guard | **Yes** *(if stub valid)* |
| Pass full `assertLivePathPreSubmit` for BUY | **Partial** — removes R15 missing blocker; other guards still apply |
| Micro-Live Execution Authorization | **No** — separate signed gate required |
| Candidate selection / final per-trade confirmation | **No** |
| Actual trade / broadcast | **No** — separate execution gate required |
| Scanner/executor `--loop` | **No** |
| Strategy deployment / scaling | **No** |
| Live/soak/strategy readiness claims | **No** |

**Invariant:** stub creation = machine-readable mirror only · **not** execution authorization.

---

## 10. Expiration / consumption behavior

Aligned with signed EV02 R15 + Arming Authorization expiration rules:

| Trigger | Stub / session handling |
|---------|-------------------------|
| R15 unused expiry (**2026-07-14**) | Stub must be removed/disabled; no new BUY |
| R15 consumed (one entry / armed session completed) | Remove/disable stub; RB-G9 required |
| Armed session ends (disarm) | Remove/disable stub; RB-G9 at `Sessions/SESSION — RB-G9-20260707-EV02 — {date}/` |
| Ambiguity / halt / e-stop / posture drift | Halt · remove/disable stub · RB-G9 |
| Safety or validator failure | Remove/disable stub |
| Jupiter U1/U2 regression | Remove/disable stub · halt |
| Signer/public address mismatch | Reauthorization required · old stub invalid |
| Process-isolation failure (loop running during/after stub) | Remove stub · halt · re-verify isolation |
| One armed session completed | R15 ONE_SESSION_ONLY consumed per policy |

**Operational rule:** After session closure, delete or rename stub (e.g. `r15_manual_approval_record.consumed.json`) and verify BUY blocked again.

---

## 11. Rollback / removal procedure

| Step | Action | Verification |
|------|--------|--------------|
| **1** | Delete or move `analysis/r15_manual_approval_record.json` | File absent |
| **2** | Run `assertMicroLiveApprovalRecord` probe | **BLOCKED** — "record missing" |
| **3** | Run BUY `assertLivePathPreSubmit` probe | **BLOCKED** at R15 gate |
| **4** | Confirm no transaction / position / capital | 0 open live · 0 pending · 0 recovery |
| **5** | Preserve canonical signed Ori records | Do not delete `Authorizations/AUTHORIZATION — R15 … EV02 …` |
| **6** | Optional: `node r15_manual_approval_check.js` | Status reflects missing/invalid record |

**Disarm note:** Removing stub does **not** disarm. Full disarm still requires C1–C3 rollback per arming transition plan.

---

## 12. Future stub creation — abort criteria

Abort before write or revert immediately after:

| # | Condition |
|---|-----------|
| **A1** | EV02 R15 invalid · expired · consumed |
| **A2** | Session ID mismatch vs `RB-G9-20260707-EV02` |
| **A3** | EV01 session/auth reuse attempted |
| **A4** | Signer/public address mismatch |
| **A5** | Schema missing enforced fields (§4.1) |
| **A6** | Wrong `finalApprovalStatus` string |
| **A7** | `maxFirstTradeSizeSol` > 0.005 or 0.01 authorized in stub |
| **A8** | Secrets / RPC credentials / raw env in JSON |
| **A9** | Stub path not under gitignored `analysis/` |
| **A10** | **`live_executor.js --loop` process present** |
| **A11** | Replacement executor process appears |
| **A12** | Micro-live execution attempted |
| **A13** | Submit / broadcast invoked |
| **A14** | Position / reconciliation / recovery / capital appears |
| **A15** | `assertMicroLiveApprovalRecord` probe fails after write |
| **A16** | G3 enabled or `FOMO_ALLOW_LOOP_LIVE=YES` |
| **A17** | OR promotion attempted |

---

## 13. Current armed-only posture verification (read-only — 2026-07-07)

| Check | Result |
|-------|--------|
| `liveArmed` | **`true`** |
| `operationalPosture` | **`LIVE_ARMED`** |
| Guard failures | **`[]`** |
| `FOMO_ALLOW_LOOP_LIVE` | unset / not `YES` |
| G3 | **disabled** |
| Runtime stub | **absent** |
| `assertMicroLiveApprovalRecord` | **BLOCKED** — "R15 manual approval record missing" |
| BUY `assertLivePathPreSubmit` | **BLOCKED** — same (R15 gate) |
| Executor loop process | **0** — PID 35400 stopped |
| Monitor PID 6568 / scanner PID 9896 | **unchanged · isolated** |
| Open live positions | **0** |
| Pending reconciliation | **0** |
| Recovery actions | **0** |
| Capital exposure | **none** |
| Submit/broadcast | **No** |
| Transaction signatures | **none** |

**System remains armed:** **Yes** — ARMED ONLY · micro-live not authorized · stub absent · BUY still blocked

---

## 14. Explicit non-actions (this gate)

| Item | Status |
|------|--------|
| Runtime stub created | **No** |
| Micro-live execution authorized | **No** |
| Config / `.env` modified | **No** |
| Disarm performed | **No** |
| Executor loop started/restarted | **No** |
| Session folder created | **No** |
| OR promotion | **No** |
| Readiness/profitability claims | **No** |

---

## 15. Recommended next gate

**Fresh Runtime R15 Approval Stub Creation Authorization**

---

## 16. Safety confirmation

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
`Ori/Phase 2/Project Vulcan/Live Readiness/FRESH RUNTIME R15 APPROVAL STUB PLANNING — 2026-07-07.md`
