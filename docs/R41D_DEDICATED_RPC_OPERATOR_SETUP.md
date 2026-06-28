# R41D — Dedicated RPC Operator Setup

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Track:** A — Micro-live engineering proof  
**Status:** **BUILT** — local config support only  
**Review date:** 2026-06-23  

**Prerequisites:** [R41C](./R41C_DEDICATED_RPC_AND_SIGNER_READINESS.md) · [R41B](./R41B_LOCAL_SIGNER_SAFETY_STUBS.md)

**Live trading:** **NOT APPROVED**  
**Micro-live:** **NOT APPROVED**  
**Real RPC URLs:** **NOT COMMITTED**

---

## 1. Purpose

R41D prepares a **safe dedicated RPC configuration path** for the future one-transaction engineering proof. Operators can configure a dedicated endpoint locally without committing secrets to the repository.

This is **not** live trading enablement. This is **not** transaction submission. This is **not** R43 approval.

---

## 2. Why dedicated RPC matters

The micro-live engineering proof must **not** use public/shared fallback RPC endpoints because:

| Risk | Impact |
|------|--------|
| Rate limits | Submission failures during proof window |
| Latency variance | Unreliable confirmation timing |
| Shared infrastructure | Noisy-neighbor effects on critical path |
| Observability | Harder to diagnose proof failures |

Public `api.mainnet-beta.solana.com` fallback is acceptable for **pipeline observation only**. Simulation, submission, and micro-live proof require a **dedicated provider endpoint**.

---

## 3. Approved configuration method

### Primary (recommended): local environment variable

```bash
TRACKTA_MICRO_LIVE_RPC_URL=https://your-dedicated-provider.example/?api-key=YOUR_KEY
```

Set in `.env.local` or shell profile — **never commit**.

### Optional fallback: local config file

Copy the example template:

```bash
cp examples/local_rpc_config.example.json operator_records/local_rpc_config.json
```

Edit locally with your real RPC URL. The file is **gitignored** and must **never** be committed with a real key.

**Precedence:** `TRACKTA_MICRO_LIVE_RPC_URL` env var wins over local file.

---

## 4. Security rules

| Rule | Requirement |
|------|-------------|
| Never commit real RPC URLs with API keys | Use `.gitignore` + example templates only |
| Never paste RPC keys into Cursor chat | Local operator action only |
| Never write full RPC URL to docs/logs/analysis | Redact query strings and key-like path segments |
| Store real RPC only locally | Env var or gitignored file |
| Use dedicated provider endpoint | Not public Solana fallback |
| Restrict endpoint if provider supports allowlists | Recommended |
| Rotate key after proof if desired | Operator discretion |

---

## 5. Gitignored local-only files

| Path | Purpose |
|------|---------|
| `operator_records/local_rpc_config.json` | Optional local RPC config |
| `operator_records/*.secret.json` | Future local secret-adjacent configs |
| `.env` | Environment secrets |
| `.env.local` | Local environment overrides |

The committed operator caps draft (`operator_records/micro_live_demo_caps.json`) remains tracked with `approved: false`.

---

## 6. Example template

`examples/local_rpc_config.example.json` — placeholders only:

```json
{
  "configType": "LOCAL_RPC_EXAMPLE",
  "purpose": "micro-live engineering proof only",
  "rpcUrl": "https://YOUR_DEDICATED_RPC_PROVIDER.example/REDACTED",
  "notes": "Copy to operator_records/local_rpc_config.json locally. Do not commit real RPC URL."
}
```

---

## 7. RPC config loader

| Module | Role |
|--------|------|
| `micro_live_rpc_config.js` | Load/classify/redact RPC config from env or local file |
| `test_micro_live_rpc_config.js` | Temp-fixture regression tests |
| `micro_live_rpc_preflight.js` | Updated to use R41D loader (R41C readiness) |

### Classification statuses

| Status | Meaning |
|--------|---------|
| `MISSING` | No env var or local file configured |
| `PLACEHOLDER` | Obvious placeholder or localhost (without test mark) |
| `PUBLIC_FALLBACK` | Public Solana RPC detected |
| `DEDICATED_CANDIDATE` | Non-public dedicated-looking endpoint configured |

**Network reachability is not probed** in R41D (no unsafe live calls with keys).

### Safe metadata only

The loader exposes redacted URLs and status — never the full RPC URL with key in output.

---

## 8. Usage

```bash
# Check operator RPC setup
node micro_live_rpc_config.js

# Full R41C readiness (includes R41D RPC section)
node micro_live_rpc_preflight.js
```

Outputs:

- `analysis/r41d_rpc_operator_setup.json`
- `analysis/r41c_rpc_signer_readiness.json` (includes `r41dRpcOperatorSetup` section)

---

## 9. Remaining blockers before R43

1. **Operator configures dedicated RPC locally** (`TRACKTA_MICRO_LIVE_RPC_URL` or local file)
2. **Operator caps R43 approval** (`approved: true`)
3. **Real local signer** (post-R43)
4. **`live_executor.js` integration** (intentionally absent)
5. **R43 final human approval**
6. **R7 strategy edge** — NOT ENOUGH DATA

---

## 10. Explicit non-goals

- Does not enable live trading
- Does not change `executionMode`, `dryRunMode`, or `liveArmed`
- Does not set caps `approved: true`
- Does not add/read/parse signer private keys
- Does not submit transactions
- Does not integrate signer into `live_executor.js`
- Does not commit real RPC URLs or keys

---

*R41D — local RPC operator setup only. Live trading remains NOT APPROVED.*
