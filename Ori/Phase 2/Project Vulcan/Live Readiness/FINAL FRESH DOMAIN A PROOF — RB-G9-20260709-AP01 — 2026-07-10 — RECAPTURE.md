# Final Fresh Domain A Proof — RB-G9-20260709-AP01 — 2026-07-10 — RECAPTURE

Status:
**FRESH DOMAIN A RECAPTURE PASS — NEW 30-MINUTE BASELINE — PRODUCTION DISARMED UNCHANGED**

Gate type:
Session-bound Domain A recapture — supersedes expired baseline after failed-closed process isolation

Prerequisites:
`RB-G9-20260709-AP01 PROCESS ISOLATION GATE — 2026-07-10.md` (FAIL CLOSED — ARMING_BASELINE_EXPIRED) · signed G1–G4 · prior proof `FINAL FRESH DOMAIN A PROOF — RB-G9-20260709-AP01 — 2026-07-10.md`

Recapture date:
**2026-07-10**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Processes stopped/started:** **No** · **C1/C2/C3:** **No** · **Runtime stub / session folder:** **Not created**

---

## 1. Prominent post-gate state

> **DISARMED · DRY · NO TRADE**
>
> **NEW ARMING BASELINE CAPTURED**
>
> **PRIOR BASELINE SUPERSEDED — NOT REUSED**

---

## 2. Supersession record

| Field | Value |
|-------|-------|
| **supersedesPreviousBaseline** | **true** |
| **Prior armingBaselineHash** | `299b09d5a701657a7031ff04ac40bd8b16459d2af94030a1d1b8f014f5ccfd2d` **EXPIRED — DO NOT REUSE** |
| **Prior freshness expiry** | `2026-07-10T18:16:56.268Z` |
| **Supersession reason** | **`ARMING_BASELINE_EXPIRED_AND_STATE_DRIFT`** |
| **New armingBaselineHash** | **`3b19a92f4f49affa9cd3ab6575b8e6f5703dab57eae6d0bf879499f996f9ebe9`** |

---

## 3. Proof timestamps

| Field | Value |
|-------|-------|
| **Proof-start UTC** | `2026-07-10T19:07:56.437Z` |
| **Proof-start local** | `Fri Jul 10 2026 13:07:56 GMT-0600 (Mountain Daylight Time)` |
| **Proof-completion UTC** | `2026-07-10T19:13:04.489Z` |
| **New freshness-expiry UTC** | `2026-07-10T19:43:04.489Z` |
| **G1 expiry UTC** | `2026-07-11T03:25:11Z` |
| **Remaining G1 lifetime** | **~8h 18m** (`29834563` ms at proof start) |
| **Safe-time sufficiency** | **PASS** |

---

## 4. G1–G4 validation

| Gate | Result | Fingerprint |
|------|--------|-------------|
| **G1** | **PASS** — SIGNED/UNUSED · unexpired | `d24fdbe6…e2a84` |
| **G2** | **PASS** | `00b8aa79…f78a3` |
| **G3** | **PASS** | `c6fc68c4…9ddf4` |
| **G4** | **PASS** | `ecb59808…9ddf4` |

**Combined authorization-chain fingerprint:** `4813507a978c2678c13c2b1fa6b79402322e7cfe28c6e2d3406c4c000874acee`

---

## 5. Drift from expired baseline

| Drift axis | Prior | Current | Classification |
|------------|-------|---------|----------------|
| **Process-set fingerprint** | `19e5589c…b0a4` | `59ca35f4…c1a1` | **benign-but-baseline-invalidating** |
| **Environment-gate fingerprint** | `b63bdf5f…aa28` | `b63bdf5f…aa28` | **unchanged at recapture** *(interim isolation gate saw `52cc3c3a…` in different shell context)* |
| **Arming baseline** | expired `299b09d5…` | new `3b19a92f…` | **superseded** |

No unexplained or unsafe drift. Process evolution reflects stable operational hosts (monitor/dashboard/scanner running; executor **0**; documented PowerShell restart loops).

---

## 6. Current process inventory (read-only — unchanged by gate)

| Identity | Node PID | Parent | Notes |
|----------|----------|--------|-------|
| **monitor.js** | **6568** | 34856 | Active |
| **dashboard_server.js** | **40392** | 45148 | Active |
| **scanner_gmgn_trending.js** | **9896** | 45808 | `--watch` |
| **live_executor.js** | — | — | **Count 0** |

**Process-set fingerprint:** `59ca35f43809d983273d3593d2f2a44cc20267e56ccd699a30cf2e46f9e6c1a1`

**Restart/watchdog evidence:**
- PID **34856** — PowerShell `while($true)` loop wrapping `monitor.js` *(candidate for explicit isolation scope if separately authorized)*
- PID **37868** — PowerShell observation loop (`b2a_24h_observation_status.js`) — **not** in default stop list
- **Scheduled tasks:** none matched monitor/dashboard/scanner

PowerShell loop termination **not assumed authorized** by monitor/dashboard/scanner stop alone.

---

## 7. Baseline fingerprints (new)

| Field | Value |
|-------|-------|
| **live_config hash** | `0996882e1a5244d05079a2a6f3ff09049758ecbbf3b8e3e0434ee4b13a4d33ef` |
| **Code fingerprint (extended)** | `f3c5b20080bdc5a6cfef85863f13448ca8da4cc4a81a2d8434e7707ba83ae042` |
| **Environment-gate fingerprint** | `b63bdf5f2a8dc4dfbbc208456c4ac28f1fbb91cbae5ad97112a1995bfc72aa28` |
| **Runtime-stub absent fingerprint** | `f0e6b2e295326f6c0e20c1f6eb88eddd071755c4c00b0b28eabda8790268b533` |
| **Wallet binding** | `FXLGxPo4JAv1WGJy728WnZiEzxsP4XvLRF2y6KdoxBH6` · match **PASS** |
| **RPC health** | read-only **PASS** |

---

## 8. Domain A validation

| Command | Result |
|---------|--------|
| `node validate_live_system.js` | **PASS** — 0 failures · 5 warnings |
| `node run_safety_tests.js` | **PASS** — **85/85** |
| N6 dry drill | **PASS** |

---

## 9. Domain B wrong-context (disarmed)

| Tool | Exit | Result |
|------|------|--------|
| `validate_armed_preflight.js` | **2** | `WRONG_POSTURE` |
| `run_armed_preflight_manifest.js` | **2** | no AP overall PASS |
| `test_n6_armed_estop_probe.js` | **1** | fail-closed |

---

## 10. Controlled process-delta rule

**Recorded: yes**

Later **Process Isolation Gate** may stop only:
- `monitor.js`
- `dashboard_server.js`
- `scanner_gmgn_trending.js`

PowerShell restart loops require **explicit separate authorization** if in scope.

Future arming must bind:
- **`armingBaselineHash`:** `3b19a92f4f49affa9cd3ab6575b8e6f5703dab57eae6d0bf879499f996f9ebe9`
- **`isolatedProcessSetHash`:** *(derived in process isolation gate)*

---

## 11. Post-gate verification

| Check | Result |
|-------|--------|
| **Code/config/environment/process changed during gate** | **No** |
| **G1–G4 consumed** | **No** |
| **System remains disarmed** | **Yes** |
| **Submit/sign/broadcast** | **None** |
| **Flat capital state** | 0 positions · no exposure |

---

## 12. Evidence artifacts

| Artifact | Path |
|----------|------|
| Machine-readable receipt | `analysis/rb_g9_20260709_ap01_final_domain_a_receipt.json` |
| Arming-baseline manifest | `analysis/rb_g9_20260709_ap01_arming_baseline_manifest.json` |
| Domain A / safety / armed outputs | `analysis/rb_g9_ap01_recapture_*` |

---

## 13. Final Domain A proof status

**PASS — RECAPTURE**

---

## 14. Recommended next gate

**RB-G9-20260709-AP01 Process Isolation Gate**

*(Must complete within freshness window **`2026-07-10T19:43:04.489Z`**)*

---

**Receipt path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/FINAL FRESH DOMAIN A PROOF — RB-G9-20260709-AP01 — 2026-07-10 — RECAPTURE.md`
