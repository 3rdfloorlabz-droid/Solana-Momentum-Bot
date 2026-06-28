# R41C — Dedicated RPC + Local Signer Readiness

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Track:** A — Micro-live engineering proof  
**Status:** **BUILT** — readiness check only  
**Review date:** 2026-06-23  

**Prerequisites:** [R41B](./R41B_LOCAL_SIGNER_SAFETY_STUBS.md) · [R41](./R41_LOCAL_SIGNER_IMPLEMENTATION_PLAN.md) · [R42](./R42_FINAL_MICRO_LIVE_APPROVAL_REVIEW.md)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Private keys:** **NOT HANDLED**  
**Real signing:** **NOT IMPLEMENTED**

---

## 1. Purpose

R41C prepares the **final readiness checks** for a future one-transaction engineering proof. It verifies dedicated RPC configuration, local signer stub posture, operator caps draft state, and explicit blockers before **R43** human approval.

This is **not** real signing. This is **not** executor integration. This is **not** transaction submission. This is **not** live trading approval.

---

## 2. What was built

| Module | Role |
|--------|------|
| `micro_live_rpc_preflight.js` | Read-only RPC + signer readiness checker |
| `test_micro_live_rpc_preflight.js` | Temp-fixture regression tests |
| `analysis/r41c_rpc_signer_readiness.json` | Checker output (gitignored) |

**Verdict:** `R41C READINESS CHECK ONLY — NOT APPROVED FOR LIVE TRADING`

---

## 3. Dedicated RPC rules

Future micro-live proof must use a **dedicated RPC endpoint**, not a public fallback.

The checker **fails** when:

| Condition | Result |
|-----------|--------|
| RPC URL missing | Fail |
| RPC URL is placeholder / empty | Fail |
| RPC URL is public Solana fallback (`api.mainnet-beta.solana.com`, etc.) | Fail |
| RPC URL is localhost without explicit test-only mark | Fail |
| RPC API key committed in `live_config.json` | Fail |
| RPC key would appear in analysis output | Redacted — never printed in full |

**Reachability:** R41C does **not** probe RPC endpoints over the network (no unsafe live calls with keys). Configuration is validated statically only.

---

## 4. Signer readiness rules

| Check | Expected |
|-------|----------|
| `local_signer.js` present | Yes |
| `signer_provider.js` present | Yes |
| `mock_signer.js` present | Yes |
| `secret_safety_scan.js` present | Yes |
| `signer_plan_preflight.js` present | Yes |
| Local signer stub-only | `LOCAL_SIGNER_STUB_NOT_ARMED` / `LOCAL_SIGN_NOT_IMPLEMENTED` |
| Real signer provider | Blocked (`local_real`, `real`, `hardware`) |
| `live_executor.js` signer import | **Must not** import `local_signer.js` yet |
| Non-test secret patterns | Must be absent |
| Real key files in repo | Must be absent (via secret scan) |

---

## 5. Operator caps rules

| Check | Expected |
|-------|----------|
| `operator_records/micro_live_demo_caps.json` | Present |
| `approved` | **`false`** (R43 required for approval) |
| `maxTradeSizeSol` | `<= 0.02` |
| `maxDailyLossSol` | `<= 0.05` |
| `maxTradesPerSession` | `=== 1` |
| `maxOpenLivePositions` | `=== 1` |
| `autoCompoundingAllowed` | `false` |
| `requireHumanPresent` | `true` |
| `stopAfterFirstTransaction` | `true` |

**Premature approval:** If `approved: true` before R43, the checker fails.

---

## 6. Readiness verdicts

| Verdict | Meaning |
|---------|---------|
| `NOT_READY` | Posture, signer, caps, secrets, or recovery blockers present |
| `PARTIAL_READINESS` | Signer + caps draft OK; dedicated RPC or wallet status pending |
| `READY_FOR_R43_REVIEW` | Infrastructure checks pass — **R43 human approval still required** |

None of these verdicts approve live trading or micro-live execution.

---

## 7. Remaining blockers before R43

1. **Operator caps R43 human approval** (`approved: true` with signed record)
2. **Dedicated RPC** provisioned (non-public endpoint)
3. **Real local signer** implementation (post-R43, outside stub phase)
4. **`live_executor.js` integration** (intentionally absent until R43)
5. **Executor singleton lock** cleared for micro-live window
6. **R7 strategy edge** — NOT ENOUGH DATA
7. **Final human approval** at R43

---

## 8. Usage

```bash
node micro_live_rpc_preflight.js
node test_micro_live_rpc_preflight.js
```

Output: `analysis/r41c_rpc_signer_readiness.json`

---

## 9. Explicit non-goals

- Does not set `approved: true` on operator caps
- Does not change `executionMode`, `dryRunMode`, or `liveArmed`
- Does not add, read, parse, or print private keys
- Does not submit transactions
- Does not integrate signer into `live_executor.js`
- Does not create `recovery_actions.jsonl`
- Does not approve micro-live or full live trading

---

*R41C — readiness check only. Live trading remains NOT APPROVED.*
