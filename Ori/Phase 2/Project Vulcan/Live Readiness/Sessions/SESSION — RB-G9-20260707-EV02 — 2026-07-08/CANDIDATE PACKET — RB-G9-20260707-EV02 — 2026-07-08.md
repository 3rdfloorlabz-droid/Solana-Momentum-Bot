# Candidate Packet — RB-G9-20260707-EV02 — 2026-07-08

Status:
**PREPARATION ONLY · NOT EXECUTABLE · FINAL PER-TRADE CONFIRMATION NOT RECEIVED**

Session ID:
**`RB-G9-20260707-EV02`**

Prepared at (UTC):
**2026-07-09T01:35:51.605Z**

Authorization expires (UTC):
**2026-07-09T05:28:00.000Z**

---

## 1. Candidate identity

| Field | Value |
|-------|-------|
| **Name / symbol** | Jupiter / **JUP** |
| **Mint** | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` |
| **Pair/pool (reference)** | `3xNGdc58axYtrJ64STQz5TrdQWVtWHLR888iRBbWZnEe` |
| **Chain / venue** | Solana · Meteora reference pool · Jupiter aggregated routes |
| **Selection rationale** | Engineering-validation routability baseline; deep liquidity; **not** momentum-selected |

---

## 2. Liquidity and market reference

| Field | Value |
|-------|-------|
| **Source** | Dexscreener |
| **Liquidity (USD)** | **$210,646,524.17** |
| **Reference pair URL** | https://dexscreener.com/solana/3xngdc58axytrj64stqz5trdqwvthlrr888irbbwznee |

---

## 3. Jupiter execution path (preparation evidence)

| Check | Result |
|-------|--------|
| Adapter | `jupiter_swap_client.js` / `live_executor.js` |
| Quote base | `https://lite-api.jup.ag/swap/v1` |
| Quote path | `/swap/v1/quote` |
| Swap build path | `/swap/v1/swap` |
| Quote/build host match | **Yes** |
| Deprecated `quote-api.jup.ag/v6` | **Not used** |
| Split-host path | **Blocked** |

**Disclaimer:** Preparation quotes are **evidence only**. Execution gate must obtain a **fresh quote ≤ 10 seconds** old.

---

## 4. Entry quote (preparation · non-executable)

| Field | Value |
|-------|-------|
| **Timestamp (UTC)** | **2026-07-09T01:35:51.197Z** |
| **Quote age at capture** | **408 ms** |
| **Input** | **0.005 SOL** (5,000,000 lamports) |
| **Expected output** | **1.819554 JUP** (raw `1819554` at 6 decimals) |
| **Min threshold (100 bps)** | `1801359` |
| **Price impact** | **0%** |
| **Slippage** | **100 bps** |
| **Route** | Raydium CLMM `EZVkeboWeXygtq8LMyENHyXdF5wpYrtExRNH9UwB1qYw` (100%) |

---

## 5. Exit quote (preparation · non-executable)

| Field | Value |
|-------|-------|
| **Timestamp (UTC)** | **2026-07-09T01:35:51.413Z** |
| **Input** | Full BUY prep output (`1819554` raw units) |
| **Expected SOL out** | **0.004998198 SOL** (4,998,198 lamports) |
| **Min threshold** | 4,948,217 lamports |
| **Price impact** | **~0.00022%** |
| **Slippage** | **100 bps** |
| **Route** | ZeroFi → Deriverse |
| **SELL route verified (prep)** | **Yes** |

**Route asymmetry:** BUY and SELL prep routes differ via Jupiter aggregation; both legs returned quotes at preparation time.

---

## 6. Token safety

| Check | Result |
|-------|--------|
| **Token program** | SPL Token (`Tokenkeg…`) |
| **Mint authority** | **null** |
| **Freeze authority** | **null** |
| **Decimals** | **6** |
| **Token-2022** | **No** |
| **Transfer restriction** | **None detected** |
| **Unsupported extension** | **None detected** |
| **Honeypot / sellability (prep)** | SELL quote returned — **no block observed** |

---

## 7. Fee decomposition (U1/U2 remediated · no double-count)

| Component | Amount (SOL) | Refundable? |
|-----------|--------------|-------------|
| **Trade notional** | **0.005** | n/a |
| **Base fee (1 sig planning)** | **0.000005** | No |
| **Priority fee (fallback planning)** | **0.0002** | No |
| **Priority fee cap (config max)** | **0.001** | No |
| **Platform/route fee** | Embedded in route · not separately charged in prep | — |
| **ATA rent (if created)** | **~0.00203928** | **Yes** (typically) |
| **Non-rent single-entry upper bound** | **~0.000205** | No |
| **Wallet debit upper bound (no ATA)** | **~0.005205** | — |
| **Wallet debit upper bound (with ATA)** | **~0.007244** | — |
| **Double-count priority fee** | **No** | — |

**Exit fees:** Additional base + priority for mandatory SELL **not** included in entry non-rent bound.

**Config minimum wallet balance:** **0.12 SOL**

**Fee policy verdict:** **PASS** for engineering test — no EV01-style 0.007 SOL double-count.

---

## 8. CS1–CS13 matrix

| ID | Result |
|----|--------|
| CS1 Manual selection | **PASS** |
| CS2 Mint recorded | **PASS** |
| CS3 Pair/pool recorded | **PASS** |
| CS4 Liquidity ≥ $25k | **PASS** |
| CS5 Impact ≤ 2% | **PASS** |
| CS6 Quote age ≤ 10s | **PASS at capture** — refetch required at execution |
| CS7 Slippage ≤ 100 bps | **PASS** |
| CS8 Freeze/restriction/honeypot | **PASS** |
| CS9 Route/venue documented | **PASS** |
| CS10 Reliable BUY route | **PASS** (prep quote) |
| CS11 Reliable SELL route | **PASS** (prep quote) |
| CS12 Entry/exit consistency | **PASS with asymmetry note** |
| CS13 Fee decomposition | **PASS** |

---

## 9. Unresolved risks

- Preparation quotes non-executable; fresh quote mandatory at execution
- Route may change at execution
- Real broadcast / confirmation / reconciliation / exit **unproven**
- Production-root e-stop and reconciliation proofs **deferred**
- Strategy **NOT READY** — engineering validation only
- Total loss, slippage, MEV, RPC, exit failure within signed caps

---

## 10. Exact final confirmation string (unsigned)

```
CONFIRM RB-G9-20260707-EV02 FOR JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN AT 3xNGdc58axYtrJ64STQz5TrdQWVtWHLR888iRBbWZnEe — ONE 0.005 SOL ENTRY AND MANDATORY EXIT
```

**Final per-trade confirmation received:** **No**

---

## 11. Linked machine record

`candidate_packet.json` in this folder.

---

**Packet path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Sessions/SESSION — RB-G9-20260707-EV02 — 2026-07-08/CANDIDATE PACKET — RB-G9-20260707-EV02 — 2026-07-08.md`
