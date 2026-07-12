# Candidate Packet — RB-G9-20260706-EV01 — 2026-07-07

Status:
**Preparation packet only — NOT EXECUTABLE — final per-trade confirmation NOT received**

Gate:
Micro-Live Candidate Selection and Per-Trade Confirmation Preparation — 2026-07-07

Session:
**RB-G9-20260706-EV01**

Authorization expiry (UTC):
**2026-07-07T21:44:00.000Z** *(3:44 PM America/Denver)*

Machine sidecar:
[`candidate_packet.json`](candidate_packet.json)

---

## 1. Candidate identity

| Field | Value |
|-------|-------|
| **Token name** | Jupiter |
| **Symbol** | JUP |
| **Mint address** | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` |
| **Primary reference pair (Dexscreener)** | `C8Gr6AUuq9hEdSYJzoEpNcdjpojPZwqG5MtQbeouNNwg` |
| **Chain** | Solana |
| **Reference venue (pool)** | Meteora *(Dexscreener `dexId: meteora`)* |
| **Selection rationale** | Engineering-validation routability baseline — deep liquidity, established SPL mint, verified Jupiter BUY+SELL quotes at 0.005 SOL; **not** selected on momentum, popularity, or social attention |

---

## 2. Route summary (preparation-time — non-executable)

### Entry route (BUY · 0.005 SOL → JUP)

| Field | Value |
|-------|-------|
| **Quote API used (research only)** | `lite-api.jup.ag/swap/v1/quote` |
| **Quote timestamp (UTC)** | **2026-07-07T17:52:01.228Z** |
| **Quote age at capture** | **601 ms** |
| **Input** | **5,000,000 lamports (0.005 SOL)** |
| **Expected output (raw)** | **1,705,340** base units *(6 decimals → ~1.70534 JUP)* |
| **Minimum output threshold (raw)** | **1,688,287** *(100 bps slippage envelope)* |
| **Quoted price impact** | **0%** |
| **Quoted slippage** | **100 bps** |
| **Route hops** | Scorch *(100%)* · AMM `7T5BKFBFLGSgVBKKcBwrrUTHPtpVGvorKfmYuS4TzdfV` |

### Exit route (SELL · full expected token amount → SOL)

| Field | Value |
|-------|-------|
| **Quote timestamp (UTC)** | **2026-07-07T17:52:01.456Z** |
| **Input (raw)** | **1,705,340** JUP base units |
| **Expected output (lamports)** | **4,997,480** *(~0.004997 SOL)* |
| **Minimum output threshold (lamports)** | **4,947,506** |
| **Quoted price impact** | **~0.00084%** |
| **Quoted slippage** | **100 bps** |
| **Route hops** | HumidiFi · Riptide · Raydium CLMM |
| **Sell route verified (preparation quote)** | **Yes** |

**Freshness disclaimer:** This quote is **preparation evidence only**. It is **not** an executable quote. A **completely fresh quote ≤ 10 seconds old** must be obtained in the **Micro-Live Single-Trade Execution Gate** immediately before Taylor’s final confirmation and any submit.

---

## 3. Liquidity and market context

| Field | Value |
|-------|-------|
| **Available liquidity (Dexscreener USD)** | **$1,190,460.89** |
| **Reference price (USD)** | **$0.2421** |
| **FDV (Dexscreener)** | **~$1.70B** |
| **Pair URL** | https://dexscreener.com/solana/c8gr6auuq9hedsyjzoepncdjpojpzwqg5mtqbeounnwg |

---

## 4. Token safety checks (read-only)

| Check | Result |
|-------|--------|
| **Token program** | SPL Token (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`) |
| **Mint authority** | **null** *(fixed supply — no new minting)* |
| **Freeze authority** | **null** *(no freeze detected)* |
| **Decimals** | **6** |
| **Token-2022 extensions** | **Not detected** |
| **Transfer restriction (detectable)** | **None observed** |
| **Honeypot / sellability (quote-based)** | **SELL quote returned** at preparation size — no sell block observed |
| **Pool concentration concern** | **Low for engineering test** — liquidity >> $25k floor; FDV large |

---

## 5. Fees and worst-case entry cost (estimate)

| Item | Value |
|------|-------|
| **Trade notional** | **0.005 SOL** |
| **Fallback priority fee budget** | **200,000 lamports** |
| **Max priority fee budget (config cap)** | **1,000,000 lamports** |
| **Estimated worst-case entry cost (trade + 2× max priority cap)** | **~0.007 SOL** *(0.005 + 0.002)* |

---

## 6. CS1–CS11 satisfaction (preparation gate)

| ID | Requirement | Preparation result |
|----|-------------|-------------------|
| **CS1** | Manual selection only | **PASS** — operator-bounded research; no scanner loop |
| **CS2** | Token address recorded | **PASS** — mint above |
| **CS3** | Pair address recorded | **PASS** — Dexscreener reference pair recorded |
| **CS4** | Liquidity ≥ $25,000 | **PASS** — $1,190,460.89 |
| **CS5** | Impact ≤ 2% | **PASS** — BUY 0% · SELL ~0.00084% |
| **CS6** | Quote age ≤ 10s *(at capture)* | **PASS** — 601 ms at capture; **must re-fetch at execution** |
| **CS7** | Slippage ≤ 100 bps | **PASS** — 100 bps configured on both quotes |
| **CS8** | No freeze/honeypot where detectable | **PASS** — null freeze; SELL quote OK |
| **CS9** | Route and venue documented | **PASS** — see §2 |
| **CS10** | Entry via BUY / dedicated RPC / public_micro_live_only | **PASS** *(planned)* — not executed |
| **CS11** | Exit via SELL under bounds | **PASS** *(planned)* — sell route verified at prep quote |

**CS result:** **PASS for preparation packet** — subject to fresh quote + final confirmation at execution gate.

---

## 7. Unresolved risks

| # | Risk |
|---|------|
| **U1** | **`live_executor.js` still targets deprecated `quote-api.jup.ag/v6`** — unreachable in this environment; execution gate may fail until endpoint alignment or API key path verified against production executor |
| **U2** | Preparation quotes used **`lite-api.jup.ag`** for research only — production submit path may differ |
| **U3** | Jupiter route at execution may differ from preparation route — route fingerprint must be re-checked |
| **U4** | Real broadcast, confirmation, reconciliation, and exit remain **unproven** |
| **U5** | Production-root e-stop/reconciliation proofs **deferred** |
| **U6** | Strategy **NOT READY** — no edge or profitability claim |
| **U7** | Slippage, MEV, RPC failure, failed exit, and total loss remain possible within signed caps |
| **U8** | Dexscreener reference pair (Meteora) may differ from Jupiter aggregate route venues |

---

## 8. Rejected candidates (address · reason · timestamp only)

| Mint address | Reason | Timestamp (UTC) |
|--------------|--------|-----------------|
| *(none — first candidate passed)* | — | — |

*Bounded evaluation list contained 4 addresses; research stopped after first CS-pass.*

---

## 9. Final per-trade confirmation block (unsigned — for Taylor)

```
SESSION: RB-G9-20260706-EV01
CANDIDATE: Jupiter (JUP)
MINT: JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN
PAIR (reference): C8Gr6AUuq9hEdSYJzoEpNcdjpojPZwqG5MtQbeouNNwg
VENUE: Meteora reference pool / Jupiter aggregated route
PROPOSED SIZE: 0.005 SOL
LIQUIDITY (prep): $1,190,460.89
IMPACT (prep): BUY 0% / SELL ~0.00084%
SLIPPAGE LIMIT: 100 bps
QUOTE (prep): 2026-07-07T17:52:01.228Z — NOT EXECUTABLE — fresh quote required
TARGET: +10%
STOP: −5%
TIMEOUT: 20 minutes
CONFIRMATION TIMEOUT: 30 seconds
MANDATORY EXIT: included in authorization scope
RISKS: total loss possible; slippage; MEV; RPC/confirmation failure; reconciliation ambiguity; exit delay/failure
STRATEGY: NOT READY — engineering validation only — no profitability or edge claim
AUTHORIZATION EXPIRES: 2026-07-07T21:44:00.000Z

CONFIRM RB-G9-20260706-EV01 FOR ONE 0.005 SOL ENTRY AND MANDATORY EXIT
```

**Final confirmation received:** **No**

---

## 10. Explicit non-authorizations (this packet)

No BUY/SELL executed · no submit/broadcast · no position · no reconciliation · no capital exposure · no candidate approval · no OR promotion · no readiness claim.
