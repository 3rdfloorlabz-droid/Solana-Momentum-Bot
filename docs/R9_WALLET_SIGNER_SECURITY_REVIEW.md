# R9 — Wallet / Signer Security Review

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **COMPLETE** — security **design only**; **no wallet connected**  
**Review date:** 2026-06-28  
**Operator note:** Research funds may be allocated later for micro-live execution validation — this review **does not approve live trading**, **does not approve micro-live**, and **does not authorize wallet connection or private-key handling**.

**Prior gates:**  
- R6a soak — **PASS**  
- R7 — **NOT ENOUGH DATA**  
- R7b — collection **IN PROGRESS**  
- R8 — **RISK CONTROLS DEFINED BUT NOT ARMED**  

**Helper:** `node r9_wallet_security_check.js` → `analysis/r9_wallet_security_status.json` (read-only)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Wallet connected:** **NO**  
**Private keys handled:** **NO**

---

## 1. Executive verdict

### **WALLET SECURITY DESIGN DEFINED BUT NOT CONNECTED**

Wallet and signer security requirements are **documented** for a **future** supervised micro-live phase. No research wallet is connected. No signing material is loaded, stored, or handled by this review. `liveArmed` remains **false**. Live submission remains **blocked**.

This verdict is **not** “ready for live trading.”

---

## 2. Current gate status

| Item | Status |
|------|--------|
| **R6a 24h dry-run soak** | **PASS** — stability under `PIPELINE_DRY_RUN` |
| **R7 Strategy / Edge Review** | **NOT ENOUGH DATA** — insufficient fresh edge evidence |
| **R7b data collection** | **IN PROGRESS** — thresholds not met |
| **R8 Risk Controls Review** | **COMPLETE** — proposed limits documented; **not armed** |
| **R9 Wallet / Signer Security Review** | **COMPLETE** — security design only |
| **Live trading** | **BLOCKED** |
| **Capital at risk** | **$0** |

Current posture (verified via `node live_executor.js --status`):

- `executionMode: PIPELINE_DRY_RUN`
- `dryRunMode: true`
- `liveArmed: false`
- `operationalPosture: PIPELINE_OBSERVING`
- `liveSubmission: DISARMED`
- `recovery_actions.jsonl`: absent
- Safety suite: **22/22 PASS** (23/23 after R9 test added)

---

## 3. Wallet model

Future micro-live must use a **dedicated research wallet only**.

| Rule | Requirement |
|------|-------------|
| Wallet purpose | **Research / execution validation only** |
| Main wallet | **Never** |
| Investor treasury wallet | **Never** |
| Personal long-term wallet | **Never** |
| Balance | **Tiny only** — aligned with R8 micro-live allocation ($25–$50 max at risk) |
| Unrelated assets | **None** |
| NFTs | **None** |
| High-value tokens | **None** |
| Seed phrase in repo | **Forbidden** |
| Private key in docs | **Forbidden** |
| Private key in chat | **Forbidden** |
| Private key in logs | **Forbidden** |
| Private key in dashboard | **Forbidden** |
| Private key in analysis files | **Forbidden** |
| Private key in git | **Forbidden** |

The research wallet public address may appear in config **only after** explicit future approval — never the signing material.

---

## 4. Research fund boundary

| Rule | Policy |
|------|--------|
| Funding method | Operator **manually funds** research wallet later — not automated |
| Loss assumption | **Total loss is possible** |
| First funding amount | Must match **R8 micro-live limits** ($25–$50 max at risk) |
| First phase purpose | **Execution validation**, not profit mode |
| Auto-compounding | **Forbidden** |
| Adding funds during active session | **Forbidden** |
| Averaging down | **Forbidden** |
| Emergency top-up | **Forbidden** |
| Additional funding | **Manual review required** before any top-up |

Research funds **do not bypass gates**.

---

## 5. Signer secret handling policy

Required policy **before any live signing implementation**:

| Rule | Requirement |
|------|-------------|
| Storage location | Signing material must live **outside git** |
| Load timing | Loaded **only at runtime** by executor/signer module |
| Console output | **Never printed** |
| JSON serialization | **Never serialized** into status/metrics output |
| Audit logs | **Never included** in audit logs |
| Dashboard client | **Never sent** to dashboard or browser |
| API routes | **Never exposed** through API routes |
| Git commits | **Never committed** |
| `.gitignore` | Must protect local credential file patterns |
| Live mode startup | Must **refuse live mode** if signer material missing or malformed |
| Dry-run mode | Must **not require** signer material |

Existing repo behavior (unchanged by R9): dry-run paths bypass real signing; live submission gates block when signer env absent.

---

## 6. Environment file policy

**Safe placeholders only.** R9 **does not create** real credential files.

Potential **future** local-only patterns (operator machine — never committed):

| Pattern | Purpose |
|---------|---------|
| `.env.local` | Local overrides (gitignored) |
| `.env.live.local` | Future supervised live session only (gitignored) |
| `secrets.local.json` | Future local signer config (gitignored) |

**Placeholder example only:**

```text
SOLANA_SIGNER_SECRET=PRIVATE_KEY_DO_NOT_USE_FAKE_EXAMPLE_ONLY
```

**Operator must never commit real signing material.**  
Use `.env.example` with empty or fake placeholders only. Current `.gitignore` already excludes `.env`, `.env.*`, `secrets/`, `*secret*`, `SOLANA_SIGNER_SECRET*`, and related patterns.

---

## 7. Permission / approval risk

Review areas for future micro-live (design only):

| Risk | Mitigation policy |
|------|-------------------|
| Token approvals | Minimize scope; review before session; revoke after session if possible |
| Wallet permissions | Verify no unexpected delegate/authority before live start |
| Swap route permissions | Reject unstable or unknown routes |
| dApp connection risk | No browser wallet connection during bot operation |
| Malicious token risk | Reject unknown mints; use scanner/thesis gates |
| Drain risk | Tiny balance only; dedicated wallet; supervised session |
| Clipboard risk | Never paste signing material into chat, docs, or tickets |
| Browser extension risk | Avoid hot-wallet extensions on operator machine during sessions |
| Seed phrase exposure | Never store or type seed phrase in bot context |
| Hot wallet compromise | Assume hot wallet can be drained — cap funds accordingly |

---

## 8. Live transaction signing lifecycle

**Design only — not implemented in R9.**

Expected future lifecycle:

1. Candidate found (scanner + thesis + risk gates)
2. Risk checks pass (R8 limits + liquidity/slippage gates)
3. Wallet monitor status fresh
4. Signer available (runtime env only)
5. Transaction constructed
6. Transaction simulated (if supported)
7. Operator approval (first phase — if manual approval required)
8. Transaction signed
9. Transaction submitted
10. Confirmation checked on-chain
11. Position written **only after confirmation**
12. Failed transaction logged safely (no signing material)
13. No duplicate submit
14. Emergency stop blocks new signing immediately

---

## 9. Required signer safeguards

All must pass **before any live signing implementation**:

| Safeguard | Requirement |
|-----------|-------------|
| `liveArmed` | Must be **true** before live signing |
| `executionMode` | Must be **LIVE** or **MICRO_LIVE** explicitly |
| `dryRunMode` | Must be **false** before live signing |
| Triple agreement | All three must agree — **mismatch hard-blocks** |
| Emergency stop | Must **hard-block** signing |
| Wallet monitor stale | Must **hard-block** |
| Singleton lock mismatch | Must **hard-block** |
| Duplicate executor loop | Must **hard-block** |
| Missing risk config | Must **hard-block** |
| Missing R8 limits | Must **hard-block** |
| Missing explicit operator approval | Must **hard-block** |

Existing executor already refuses live submission when posture is dry-run/disarmed — R9 does not change executor behavior.

---

## 10. Logging and audit boundaries

| Rule | Requirement |
|------|-------------|
| Transaction IDs | Log **after submission** only |
| Private key / seed | **Never log** |
| Raw signer object | **Never log** |
| Full environment dump | **Never log** |
| Wallet address | Mask/redact where appropriate in shared logs |
| Audit content | Record **risk decision**, not signing material |
| Operator approval | Record approval **event** if future manual approval exists — not credentials |

Existing A3 config audit policy: secrets and `.env` values are never logged — preserve this boundary.

---

## 11. Incident response

If something goes wrong during a **future** live session:

1. **Stop live session** immediately
2. Set **emergency stop** if available
3. **Stop new signing**
4. **Preserve logs** (no credential redaction failures)
5. **Do not auto-recover** during first micro-live
6. **Manually inspect wallet** on-chain
7. **Transfer remaining funds manually** if needed (operator action outside bot)
8. **Document incident** in operator notes / Ori vault
9. **Do not restart live** until reviewed and re-approved

---

## 12. Required blockers before wallet connection

All must be cleared before **considering** connecting a research wallet — **none are cleared today**:

| # | Blocker |
|---|---------|
| B1 | **R7b sample thresholds not met** |
| B2 | **R9 design only** — not approved for wallet connection beyond documentation |
| B3 | **Signer simulation not built** |
| B4 | **Live execution path review not complete** (R10) |
| B5 | **Emergency stop live validation not complete** |
| B6 | **Micro-live config not created** |
| B7 | **Explicit human approval not given** |
| B8 | **`liveArmed` still false** |
| B9 | **Real wallet not connected** (current — required until deliberate approved connection) |
| B10 | **Dedicated RPC (A4) not provisioned** |

---

## 13. Recommended next gate

1. **Continue R7b data collection** — `node r7b_daily_summary.js` daily  
2. **Proceed to R10 Live Execution Path Review / signer simulation design**  
3. **Do not connect real wallet yet**  
4. **Do not arm live trading**

---

## 14. Verdict table

| Field | Value |
|-------|-------|
| **R9 verdict** | **WALLET SECURITY DESIGN DEFINED BUT NOT CONNECTED** |
| **Live trading approved** | **NO** |
| **Micro-live approved** | **NO** |
| **Wallet connected** | **NO** |
| **Private keys handled** | **NO** |
| **Recommended next gate** | Continue R7b → R10 Live Execution Path Review / signer simulation design |
| **Status check** | `node r9_wallet_security_check.js` |

---

## 15. Footer

R8 defined risk caps.  
R9 defines wallet/signer boundaries.  
Neither connects a wallet.  
Neither handles signing material.  
Research funds are risk capital, not permission.  
Live trading remains disarmed.  
Humans authorize.  
Ori advises.  
Gates enforce.
