# R23 — Real Provider Implementation Review

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **DEFINED ONLY** — provider integration **NOT ACTIVE**  
**Review date:** 2026-06-28  

**Helper:** `node r23_r25_provider_gate_check.js` → `analysis/r23_r25_provider_gate_status.json` (read-only)

**Related:** [R24](./R24_DISABLED_PROVIDER_ADAPTER_SKELETON.md) · [R25](./R25_REAL_QUOTE_OBSERVATION_ACTIVATION_APPROVAL_RECORD.md)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Network quote polling:** **NOT ACTIVATED**  
**Capital at risk:** **$0**

---

## 1. Executive verdict

### **REAL PROVIDER IMPLEMENTATION DESIGN DEFINED — NOT ACTIVE**

R23 defines how real quote providers could eventually be integrated safely for **observation-only** polling. This review **does not activate polling**, **does not trade**, **does not sign**, **does not submit**, and **does not connect a wallet**.

This verdict is **not** “ready for live trading.”

---

## 2. Purpose

| Goal | Description |
|------|-------------|
| Provider design | Safe integration pattern for future real quote observation |
| Abstraction | Normalized provider interface and response shape |
| Safety gates | Preconditions before any provider activation |

R23 **does not**:

- Activate network quote polling · trade · sign · submit · connect wallet

---

## 3. Provider candidates

| Provider | Status today |
|----------|--------------|
| Jupiter quote provider | Design-level — **NOT ACTIVE** |
| GMGN quote-like provider | Design-level — **NOT ACTIVE** (if supported later) |
| Local fixture provider | **Active** — fixture-only (R18/R20) |
| Replay provider | Design-level — **NOT ACTIVE** |

**Only fixture/replay scope is safe today.** Network providers require R21 approval + R24 activation review + disabled-by-default adapter skeleton.

---

## 4. Provider abstraction

Future provider interface (design-only):

| Field | Description |
|-------|-------------|
| `providerName` | e.g. `jupiter`, `gmgn`, `fixture`, `replay` |
| `mode` | `OBSERVATION_ONLY` |
| `enabled` | **`false` by default** |
| `endpointType` | `QUOTE_READ_ONLY` |
| Request fields | `inputMint`, `outputMint`, `inputAmount`, `slippageBps` cap |
| Response fields | Normalized quote payload (see §7) |
| Rate limit policy | Per R21 limits (3/min/token, 5 tokens/cycle, 100/day) |
| Timeout policy | Hard timeout; fail closed |
| Retry policy | Max 2; no retry storm |
| Redaction policy | Strip secrets from logs/responses |
| Output normalization | R18 evaluation on every record |

---

## 5. Required provider safety gates

Before any provider activation (future):

- Explicit operator approval record (R21)
- Provider allowlist defined
- `networkPollingAllowed: true` only in approved observation config
- `tradingAllowed: false`
- `signingAllowed: false`
- `submissionAllowed: false`
- `walletRequired: false`
- Safety suite green
- `recovery_actions.jsonl` absent
- Posture dry-run/disarmed
- `emergencyStop: false`
- Singleton lock healthy
- Exactly one executor loop
- Rate limits defined
- Stop conditions defined
- Ori updated

---

## 6. Request policy

Future requests must be **quote-only**:

| Allowed | Forbidden |
|---------|-----------|
| Quote request | Swap/transaction build |
| Read-only route metadata | Submit request |
| Public mint/amount fields | Signing request |
| | Private key / secrets |
| | Transaction serialization |
| | Route execution |
| | Wallet address (unless separately reviewed and unnecessary) |

---

## 7. Response normalization

Every normalized quote record must include:

- `provider`, `collectedAt`, `candidateId`
- `inputMint`, `outputMint`, `inputAmount`
- `quotedOutputAmount`, `minimumOutputAmount`
- `slippageBps`, `priceImpactBps`
- `routeSummary`, `routeHash`, `priorityFeeEstimate`, `quoteAgeSeconds`
- `warnings`, `rejectionReasons`
- `approved: false`, `tradingAllowed: false`, `signingAllowed: false`, `submissionAllowed: false`

---

## 8. Provider failure policy

| Condition | Action |
|-----------|--------|
| Default | **Fail closed** |
| Timeout | Stop record; no partial trust |
| Repeated provider errors | Stop collector |
| Rate limit response | Stop collector |
| Malformed response | Reject |
| Missing minimum output | Reject |
| Missing output | Reject |
| Stale response | Reject |
| Route instability | Reject |
| Retry storm | **Forbidden** |
| Infinite loop | **Forbidden** |

---

## 9. Security policy

- No secrets in requests or responses
- No private key, signer, or wallet connection
- No transaction object construction
- No API key unless separately reviewed and redacted
- No raw env logging
- No raw provider error dumps that may contain secrets
- Redact provider tokens if any exist later

---

## 10. Implementation blockers

Before provider implementation activation:

- [ ] No real provider implemented
- [ ] No active quote observation approval record
- [ ] No approved network config
- [ ] No provider allowlist enforced
- [ ] Rate limits not tested
- [ ] Stop switch not tested
- [ ] Real quote collector not activated
- [ ] **R24 real quote observation activation review not complete**
- [ ] **R23 only defines design** — no activation in this gate

---

## 11. Recommended next gate

1. **R24 Disabled Provider Adapter Skeleton** — built; network OFF  
2. **R25 Activation Approval Record** — defined; default NOT_APPROVED  
3. **Continue R7b** in background  
4. **Do not activate quote polling**  
5. **Do not connect wallet**

---

## 12. Verdict table

| Field | Value |
|-------|-------|
| **R23 verdict** | **REAL PROVIDER IMPLEMENTATION DESIGN DEFINED — NOT ACTIVE** |
| **Quote polling active** | **NO** |
| **Status check** | `node r23_provider_implementation_check.js` |

---

## 13. Footer

Design defined.  
Providers stay off.  
Polling stays off.  
Live remains blocked.
