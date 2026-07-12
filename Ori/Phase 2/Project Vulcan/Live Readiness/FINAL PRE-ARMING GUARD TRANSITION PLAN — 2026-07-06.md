# Final Pre-Arming Guard Transition Plan — 2026-07-06

Status:
**Plan complete — future arming guard transition and rollback/disarm procedure documented; system remains NOT ARMED; no arming, execution, or capital action**

Gate type:
Planning / documentation — guard transition and rollback procedure only

Prerequisites:
`RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md` · `R15 SECURE STORAGE DECISION — 2026-07-06.md` · `ARMING AUTHORIZATION PREPARATION REVIEW — 2026-07-06.md` · `REAL RPC NO-BROADCAST READINESS CHECK — 2026-07-06.md` · `LIVE SUBMISSION PATH READINESS REVIEW — 2026-07-06.md` · `R13 SIGN-OFF GATE — 2026-07-06.md` · `SIGNER SECRET PLACEMENT EXECUTION — 2026-07-06.md` · `MICRO-LIVE RUNBOOK CONSOLIDATION — 2026-07-05.md` · `RUNBOOK DOCUMENTATION UPDATE — 2026-07-06.md` · `ACTIVE_MANIFEST.md`

Decision authority (future arming gate):
**Taylor Cheaney** — **no arming decision in this gate**

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
| `RB-G9 STRUCTURED STORAGE DECISION — 2026-07-06.md` | Sessions/ storage; ONE_SESSION_ONLY closure |
| `R15 SECURE STORAGE DECISION — 2026-07-06.md` | Authorizations/; runtime stub rules |
| `ARMING AUTHORIZATION PREPARATION REVIEW — 2026-07-06.md` | Draft arming record; rollback sketch; blockers |
| `REAL RPC NO-BROADCAST READINESS CHECK — 2026-07-06.md` | Dedicated RPC PASS |
| `LIVE SUBMISSION PATH READINESS REVIEW — 2026-07-06.md` | Conditional arming discussion; guard stack |
| `R13 SIGN-OFF GATE — 2026-07-06.md` | Signed waiver; session caps |
| `SIGNER SECRET PLACEMENT EXECUTION — 2026-07-06.md` | Signer placed; public address verified |
| `MICRO-LIVE RUNBOOK CONSOLIDATION — 2026-07-05.md` | Pre-session · e-stop · RB-G9 |
| `RUNBOOK DOCUMENTATION UPDATE — 2026-07-06.md` | Gate separation labels |
| `ACTIVE_MANIFEST.md` | Posture boundaries; safety suite |
| `live_config.json` | Current posture snapshot (read-only) |
| `live_executor.js` | `collectLiveSubmissionGateFailures` · `computeLiveArmedStatus` · `assertLivePathPreSubmit` (read-only) |

---

## 2. Current Guard-Unsatisfied State (Verified — Not Changed This Gate)

| Field / gate | Current value | Satisfied for `liveArmed`? |
|--------------|---------------|----------------------------|
| `executionMode` | `PIPELINE_DRY_RUN` | **No** — must be `LIVE` |
| `dryRunMode` | `true` | **No** — must be `false` |
| `liveArmed` (derived) | `false` | **No** — correct |
| `emergencyStop` | `false` | **Yes** |
| `automationEnabled` | `true` | **Yes** |
| `SOLANA_SIGNER_SECRET` | present (boolean) | **Yes** |
| `FOMO_ENABLE_LIVE_SUBMISSION` | unset | **No** — must be `YES` |
| `FOMO_ALLOW_LOOP_LIVE` | unset | N/A for `liveArmed` *(required only for LIVE `--loop`)* |
| `positionSizeSol` | `0.005` | **Yes** — ≤ 0.01 |
| Dedicated RPC (`resolveRpcEndpoint`) | configured (Helius) | **Yes** — read-only verified 2026-07-06 |
| `capitalExposure` | `none` | **Yes** for arming; required at submit |
| `OR-20260630-008` | `not_promoted` | Governance — unchanged |
| Strategy readiness | **NOT READY** | Governance — not waived for deployment |

**Representative `collectLiveSubmissionGateFailures` failures today:**

1. `executionMode must be LIVE`
2. `dryRunMode must be false`
3. `FOMO_ENABLE_LIVE_SUBMISSION must equal YES`

**Operational posture:** `PIPELINE_OBSERVING` (derived) — **not** `LIVE_ARMED`.

---

## 3. Guard Stack Reference (`live_executor.js`)

### 3.1 `collectLiveSubmissionGateFailures` → `computeLiveArmedStatus`

All must pass for `liveArmed: true`:

| Gate key | Requirement |
|----------|-------------|
| `executionMode` | `resolveExecutionMode(cfg) === "LIVE"` |
| `dryRunMode` | `cfg.dryRunMode === false` |
| `emergencyStop` | `cfg.emergencyStop === false` |
| `automationEnabled` | `cfg.automationEnabled === true` |
| `signerEnv` | `process.env.SOLANA_SIGNER_SECRET` present |
| `liveSubmissionFlag` | `process.env.FOMO_ENABLE_LIVE_SUBMISSION === "YES"` |
| `positionSizeSol` | `> 0` and `<= 0.01` |
| `dedicatedRpc` | `resolveRpcEndpoint(cfg, { requireDedicated: true, purpose: "submission" })` succeeds |

### 3.2 Submit-time gates (`assertLivePathPreSubmit`) — **not** required for arming verification

These block **BUY submit** even if `liveArmed: true`:

| Check | When |
|-------|------|
| `emergencyStop` false | All submit |
| `assertLiveSubmissionArmed` | All submit |
| `capitalExposure === "none"` | All submit |
| `countPendingReconciliationEntries() === 0` | BUY only |
| `assertMicroLiveApprovalRecord` (R15 runtime stub) | BUY only |
| G3 manual slippage override | Must stay **disabled** per R13 |

**Invariant for future arming gate:** achieving `liveArmed: true` **does not** authorize submit. Arming gate must verify guards **without** calling `submitRawTransaction`, `sendTransaction`, or starting `--loop` unless separately scoped.

### 3.3 `FOMO_ALLOW_LOOP_LIVE`

| Scope | Rule |
|-------|------|
| `liveArmed` | **Not** checked in `collectLiveSubmissionGateFailures` |
| LIVE `--loop` | Blocked unless `FOMO_ALLOW_LOOP_LIVE=YES` |
| Future arming gate | **Must not set** unless separately authorized |

---

## 4. Future Guard Prerequisites (Before Arming Authorization Gate)

Governance + engineering prerequisites that must be **closed or explicitly waived in signed language** before a future **Arming Authorization Gate**:

| # | Prerequisite | Current status | Required before arming gate |
|---|--------------|----------------|----------------------------|
| **G1** | R13 signed (engineering-validation waiver) | **SIGNED** 2026-07-06 | **Yes** |
| **G2** | R15 session authorization signed in `Authorizations/` (`ONE_SESSION_ONLY`) | **Not signed** | **Yes** |
| **G3** | Signer public address verified | **PASS** | **Yes** |
| **G4** | Dedicated RPC read-only verified | **PASS** 2026-07-06 | **Yes** — re-check at arming gate if stale |
| **G5** | Safety suite re-run green | **Last 82/82 at A1-D05** — not re-run since | **Yes** — immediate re-run required |
| **G6** | RB-G9 session folder/template ready | **Templates ready** — no live session folder | **Yes** — placeholder session path prepared at arming |
| **G7** | R15 secure storage decision | **Closed** | **Yes** |
| **G8** | RB-G9 structured storage decision | **Closed** | **Yes** |
| **G9** | Guard transition plan (this document) | **Closed** | **Yes** |
| **G10** | Production-root proofs | **Deferred** | Waive in signed arming record or close separately |
| **G11** | Strategy readiness | **NOT READY** | Acknowledged — no strategy claim at arming |
| **G12** | Signed **Arming Authorization** record | **Not signed** | **Yes** — created in arming gate itself |
| **G13** | Micro-Live Execution Authorization | **Not authorized** | **No** — separate gate after arming |
| **G14** | G3 override disabled | **Disabled** | **Yes** — must remain disabled |

---

## 5. Future Arming Transition Sequence (Do Not Execute — Planning Only)

**Scope:** Future **Arming Authorization Gate** only. Taylor sign-off required. **No submit. No loop. No broadcast.**

### Phase A — Preflight (before any flag change)

| Step | Action | Abort if |
|------|--------|----------|
| **A1** | Snapshot posture: config hash · env booleans · `computeLiveArmedStatus` · `capitalExposure` | Any unexpected LIVE/armed state |
| **A2** | Confirm `liveArmed: false` · `executionMode: PIPELINE_DRY_RUN` · `dryRunMode: true` | Already armed |
| **A3** | Confirm `FOMO_ENABLE_LIVE_SUBMISSION` unset · `FOMO_ALLOW_LOOP_LIVE` not `YES` | Flags pre-set without authorization |
| **A4** | Confirm `OR-20260630-008: not_promoted` | OR promotion attempted |
| **A5** | Run `node run_safety_tests.js` — require **82/82 PASS** | Any failure |
| **A6** | Re-run read-only RPC proof (`a4_rpc_proof.runA4ReadOnlyRpcProof`) — no broadcast | FAIL or stale |
| **A7** | Verify signer public cross-check (expected wallet = config wallet) — no secret print | Mismatch |
| **A8** | Confirm signed R15 `ONE_SESSION_ONLY` in `Authorizations/` | Missing / unsigned |
| **A9** | Confirm signed **Arming Authorization** record ready for Taylor signature | Missing draft |
| **A10** | Prepare RB-G9 session placeholder: `Sessions/SESSION — RB-G9-{date}-ARM01 — {date}/` (empty template copy only) | Template missing |
| **A11** | Confirm no scanner/executor LIVE loops running | Loop active |
| **A12** | Confirm no open live position · no pending reconciliation | Ambiguity present |

### Phase B — Signed authorization (human gate)

| Step | Action |
|------|--------|
| **B1** | Taylor signs **Arming Authorization** record → `Authorizations/AUTHORIZATION — Arming — YYYY-MM-DD.md` |
| **B2** | Record explicitly lists **minimum flag changes only** and restates non-authorizations (no trade · no micro-live exec auth · no OR promotion · no readiness claims) |
| **B3** | Record links: R13 · R15 session auth · signer placement · RPC no-broadcast · this plan |

### Phase C — Minimum flag transition (future gate only — ordered)

Apply **only** what signed arming record authorizes. Typical minimum set:

| Order | Target | Field | From → To |
|-------|--------|-------|-----------|
| **C1** | `.env` | `FOMO_ENABLE_LIVE_SUBMISSION` | unset → `YES` |
| **C2** | `live_config.json` | `executionMode` | `PIPELINE_DRY_RUN` → `LIVE` |
| **C3** | `live_config.json` | `dryRunMode` | `true` → `false` |

**Do not change in arming gate unless explicitly signed:**

| Field | Default |
|-------|---------|
| `FOMO_ALLOW_LOOP_LIVE` | **Leave unset** |
| `positionSizeSol` | **Keep 0.005** |
| `capitalExposure` | **Keep none** |
| `emergencyStop` | **Keep false** |
| `automationEnabled` | **Keep true** |
| G3 override usage | **Forbidden** |

**Do not populate** `analysis/r15_manual_approval_record.json` in arming gate unless signed record explicitly requires runtime stub mirror — BUY submit still blocked until Micro-Live Execution Authorization + R15 stub either way.

### Phase D — Post-transition verification (no submit)

| Step | Action | Expected |
|------|--------|----------|
| **D1** | Reload env + config | Changes visible |
| **D2** | `computeLiveArmedStatus(cfg)` | `liveArmed: true` · `failures: []` · all gates `ok: true` |
| **D3** | `deriveOperationalPosture` | `LIVE_ARMED` |
| **D4** | Confirm **no** `submitRawTransaction` / `sendTransaction` invoked | No tx signature |
| **D5** | Confirm **no** `--loop` started | No LIVE loop |
| **D6** | Confirm **no** OPEN live position | `capitalExposure: none` |
| **D7** | Confirm BUY path still blocked without Micro-Live Execution Authorization | `assertLivePathPreSubmit` would fail on governance stub if tested — optional static check only |
| **D8** | Write arming gate receipt with before/after guard tables | Secret-free |
| **D9** | **Stop** — disarm rollback path documented and ready | Gate ends |

---

## 6. Rollback / Disarm Sequence (Future — Planning Only)

Execute immediately if arming verification fails, operator aborts, or post-arming session ends without execution authorization.

| Step | Action | Verification |
|------|--------|--------------|
| **R1** | Unset or blank `FOMO_ENABLE_LIVE_SUBMISSION` in `.env` | Env probe: unset |
| **R2** | Restore `live_config.json`: `executionMode: PIPELINE_DRY_RUN` · `dryRunMode: true` | Config read |
| **R3** | Confirm `emergencyStop: false` unless e-stop was triggered | If e-stop: follow §6.1 |
| **R4** | `computeLiveArmedStatus` → `liveArmed: false` | First failure restored (e.g. `executionMode must be LIVE`) |
| **R5** | Confirm **no transaction broadcast** occurred | No new on-chain sig from session |
| **R6** | Confirm **no OPEN live position** | No live position file / exposure |
| **R7** | Confirm `capitalExposure: none` | Posture log |
| **R8** | If arming occurred (even briefly): create/file RB-G9 record | `reviewState: NO_TRADE_EXECUTED` or `ABORTED_BEFORE_BROADCAST` |
| **R9** | R15 `ONE_SESSION_ONLY` authorization **expired** by RB-G9 filing | No second session without new R15 |
| **R10** | Write disarm receipt — before/after posture, flags reverted | No secrets |
| **R11** | Append Cursor Run Log row for disarm if separate from arming receipt | One row |

### 6.1 E-stop during armed session

| Step | Action |
|------|--------|
| **E1** | Confirm `emergencyStop: true` |
| **E2** | Do **not** submit |
| **E3** | Preserve audit + `pending_reconciliation.jsonl` |
| **E4** | Run disarm steps R1–R7 after operator review |
| **E5** | `node reset_live_safety.js` only after operator review (runbook §5.4) |
| **E6** | RB-G9 `reviewState: ESTOP_TRIGGERED` |

**Rollback command reference (sanitized — future operator execution):**

```
# Illustrative — execute only in authorized disarm context
# 1. Remove FOMO_ENABLE_LIVE_SUBMISSION from .env
# 2. Restore live_config.json executionMode + dryRunMode
# 3. node -e "… computeLiveArmedStatus …"  → expect liveArmed false
# 4. Do NOT print SOLANA_SIGNER_SECRET or dump process.env
```

---

## 7. Future Arming Abort Criteria (Immediate Halt — No Flag Change or Revert)

Abort **before** or **during** transition; revert if flags already changed:

| # | Abort condition |
|---|-----------------|
| **A1** | Missing signed R15 session record in `Authorizations/` |
| **A2** | Missing signed Arming Authorization record |
| **A3** | Missing RB-G9 template / unable to prepare session placeholder path |
| **A4** | Safety suite not **82/82 PASS** immediately before transition |
| **A5** | Signer public mismatch (`EXPECTED_WALLET` ≠ `walletPublicAddress`) |
| **A6** | RPC no-broadcast check FAIL or dedicated RPC unresolved |
| **A7** | Any live/strategy/soak **readiness claim** attempted in record |
| **A8** | G3 manual slippage override enabled or attempted |
| **A9** | OR promotion attempted or `OR-20260630-008` promoted |
| **A10** | Any submit/broadcast path invoked (`sendTransaction`, `submitRawTransaction`, etc.) |
| **A11** | Scanner/executor LIVE `--loop` started without separate authorization |
| **A12** | `FOMO_ALLOW_LOOP_LIVE=YES` set without separate authorization |
| **A13** | Secret exposure (print/log/dump of `SOLANA_SIGNER_SECRET`, RPC keys, `.env`) |
| **A14** | Posture drift not understood (unexpected `capitalExposure`, pending reconciliation, open position) |
| **A15** | `positionSizeSol` > 0.01 or config caps altered without signed scope |
| **A16** | Operator absent or emotional override pressure (runbook stop condition) |

---

## 8. Future Arming Gate Required Outputs

The future **Arming Authorization Gate** receipt **must** include:

| Output | Content |
|--------|---------|
| **Before guard stack** | Full `gates` object + `failures` from `computeLiveArmedStatus` (pre-change) |
| **After guard stack** | Full `gates` object + `failures` — expect `liveArmed: true`, empty failures |
| **Before posture** | `executionMode` · `dryRunMode` · `liveArmed` · `capitalExposure` · `operationalPosture` |
| **After posture** | Same fields post-change |
| **Flags changed** | Explicit list (env + config fields only — no values for secrets) |
| **Flags explicitly NOT changed** | `FOMO_ALLOW_LOOP_LIVE` · `capitalExposure` · G3 · OR status |
| **Rollback path** | Steps R1–R11 reference |
| **No-submit confirmation** | **PASS** — no broadcast invoked |
| **No-position confirmation** | **PASS** — no OPEN live position |
| **No-capital-exposure confirmation** | **PASS** — `capitalExposure: none` |
| **Safety suite result** | `82/82 PASS` with timestamp |
| **RPC no-broadcast result** | `READ_ONLY_RPC_OK` or equivalent metadata |
| **R15 record link** | Path to signed `Authorizations/AUTHORIZATION — R15 Micro-Live Session — …` |
| **Arming record link** | Path to signed `Authorizations/AUTHORIZATION — Arming — …` |
| **RB-G9 session path** | Placeholder or active `Sessions/SESSION — …/` path |
| **Production-root residual** | Signed deferral or closed proof reference |
| **Strategy / readiness claims** | **None** |
| **OR-20260630-008** | `not_promoted` |

---

## 9. Arming vs Execution Gate Separation (Reminder)

| Gate | May set | Must not |
|------|---------|----------|
| **Arming Authorization** | Minimum flags for `liveArmed: true` | Submit · broadcast · `--loop` · micro-live exec auth |
| **Micro-Live Execution Authorization** | Authorize future LIVE submit discussion | Execute trade |
| **Micro-Live Execution** | Real capped trade under R13 bounds | Scaling · second session · readiness claims |

**After arming gate:** system may show `LIVE_ARMED` but remains **not authorized to trade** until Micro-Live Execution Authorization + Execution gate.

---

## 10. Can Arming Authorization Gate Be Recommended Next?

**Answer: Conditional — no.**

| Condition | Status | Blocks arming gate? |
|-----------|--------|---------------------|
| Guard transition plan | **Closed** (this gate) | No |
| R15 session authorization signed | **Open** | **Yes** |
| Safety suite re-run | **Open** | **Yes** |
| Signed Arming Authorization record | **Open** | **Yes** |
| Production-root proofs | **Deferred** | Waivable in signed record |
| Real broadcast | **Unproven** | No for arming-only gate |

**Arming Authorization Gate may be recommended only after:**

1. **Safety Suite Re-Run Gate** — fresh **82/82 PASS**
2. **R15 Session Authorization Draft** (or sign-off gate) — signed `ONE_SESSION_ONLY` record in `Authorizations/`

---

## 11. Remaining Blockers (After This Gate)

| Blocker | Status |
|---------|--------|
| Safety suite re-run | **Open** — required before arming |
| R15 session authorization signed | **Open** |
| Signed Arming Authorization | **Open** |
| Real broadcast proof | **Unproven** — execution gate |
| Production-root proofs | **Deferred** |
| Micro-Live Execution Authorization | **Not authorized** |
| Strategy NOT READY | **Unchanged** |
| G3 override | **Must stay disabled** |

**Closed by this gate:** Final pre-arming guard transition plan · rollback/disarm procedure · abort criteria · arming gate output checklist.

---

## 12. Explicit Non-Authorizations (This Gate)

| Item | Status |
|------|--------|
| Arming performed | **No** |
| `liveArmed true` set | **No** |
| `FOMO_ENABLE_LIVE_SUBMISSION` set | **No** |
| Config / `.env` modified | **No** |
| Runtime / loops / broadcast | **No** |
| Micro-live execution authorized | **No** |
| Capital exposure enabled | **No** |
| OR promotion | **No** |
| Live / soak / strategy readiness claims | **No** |

---

## 13. Recommended Next Gate

**Safety Suite Re-Run Gate**

---

## 14. Safety Confirmation

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
`Ori/Phase 2/Project Vulcan/Live Readiness/FINAL PRE-ARMING GUARD TRANSITION PLAN — 2026-07-06.md`
