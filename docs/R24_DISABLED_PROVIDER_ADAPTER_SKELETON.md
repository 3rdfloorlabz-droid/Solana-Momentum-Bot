# R24 — Disabled Provider Adapter Skeleton

**Module:** TracktaOS Module 1 — Solana Momentum Bot  
**Sprint:** 4 (Phase 1 — Live-readiness gate)  
**Status:** **SKELETON BUILT** — network **OFF**  
**Review date:** 2026-06-28  

**Helper:** `node r24_provider_adapter_skeleton.js` → `analysis/r24_provider_adapter_status.json`

**Example config:** `examples/provider_adapter_config.example.json` (`active: false`)

**Prerequisites:** [R23](./R23_REAL_PROVIDER_IMPLEMENTATION_REVIEW.md)

**Live trading:** **NOT APPROVED**  
**Network quote polling:** **NOT ACTIVATED**  
**Capital at risk:** **$0**

---

## 1. Executive verdict

### **DISABLED PROVIDER ADAPTER SKELETON BUILT — NETWORK OFF**

R24 implements a **disabled-by-default** provider adapter skeleton. **Fixture/replay adapters only** are operational in this gate. Jupiter and GMGN appear as **disabled name stubs only**. **No network calls** by default.

This verdict is **not** “ready for live trading.”

---

## 2. Disabled-by-default design

| Rule | Default |
|------|---------|
| Adapter active | **`false`** |
| Network polling | **`false`** |
| Fixture provider | Enabled in example — **fixture-only** |
| Replay provider | Enabled in example — **replay-only** |
| Jupiter / GMGN | **Present as stubs — `enabled: false`** |
| Network calls | **None** |
| Real endpoints | **Not called** |
| Output | **`analysis/` only** |
| `approved` | Always **`false`** |

---

## 3. Adapter contract

| Field | Description |
|-------|-------------|
| `name` | Provider identifier |
| `enabled` | Must be `false` for live providers |
| `mode` | `FIXTURE_ONLY`, `REPLAY_ONLY`, or `OBSERVATION_ONLY` (stub) |
| `stub` | `true` for Jupiter/GMGN placeholders |

Adapter methods (skeleton only):

- `loadConfig()` — read example config
- `validateConfig()` — fail closed on forbidden flags
- `normalizeFixtureQuote()` — R18/R20-compatible shape
- **No** `fetchQuote()` network implementation in R24

---

## 4. Fail-closed behavior

- Invalid config → `INVALID_CONFIG`
- Unsafe posture → `BLOCKED`
- Live provider enabled → `INVALID_CONFIG`
- Secret fields → `INVALID_CONFIG`
- Default disabled config → `DISABLED`
- Fixture enabled → `FIXTURE_PROVIDER_READY` (fixture path only)
- Replay enabled → `REPLAY_PROVIDER_READY` (replay path only)

---

## 5. Test expectations

Tests verify: default disables network · fixture/replay allowed · Jupiter/GMGN enabled blocks · forbidden flags block · no network calls · no trading state mutation · never `approved: true`.

---

## 6. Recommended next gate

**R25 Activation Approval Record** (defined in combined sprint) → future operator review before any polling activation.

---

## 7. Footer

Skeleton built.  
Network stays off.  
Live providers stay stubs.  
Live remains blocked.
