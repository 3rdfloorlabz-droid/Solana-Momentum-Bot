# AUTHORIZATION — Process Isolation Scope Amendment — RB-G9-20260709-AP01 — 2026-07-10

> **PROCESS ISOLATION SCOPE AMENDMENT ONLY**
>
> **NO PROCESS STOPS PERFORMED**
>
> **G2 UNCHANGED · G4 UNCHANGED · NOT ARMED**
>
> **NO DOMAIN A RECAPTURE · NO C1–C3 · NO STUB · NO PROOF**
>
> This record authorizes a **future Process Isolation Gate** to stop **only** verified restart wrappers whose sole function is relaunching already-authorized Solana Momentum Bot monitor, dashboard, or scanner processes. It **does not** modify signed G2, expand G4 scope, perform C1–C3, create a runtime stub, invoke AP/N6 tooling, submit, sign, broadcast, or expose capital.

---

## Record metadata

| Field | Value |
|-------|-------|
| **Gate name** | Process Isolation Scope Amendment Authorization |
| **Record type** | Process Isolation Scope Amendment · Additive to G2 · Governance-only |
| **Status** | **SIGNED — ISOLATION NOT PERFORMED — NOT ARMED — NO CAPITAL EXPOSURE** |
| **Authorization status** | **SIGNED/UNUSED** |
| **Signer** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-11T01:35:33Z`** |
| **Signature timestamp (local)** | **`Fri Jul 10 2026 19:35:33 GMT-0600 (Mountain Daylight Time)`** |
| **Signature date** | **2026-07-10** |
| **Linked session ID** | **`RB-G9-20260709-AP01`** |
| **Linked G2 (Arming)** | [`AUTHORIZATION — Arming — RB-G9-20260709-AP01 — 2026-07-09.md`](AUTHORIZATION%20%E2%80%94%20Arming%20%E2%80%94%20RB-G9-20260709-AP01%20%E2%80%94%202026-07-09.md) |
| **Linked G2 fingerprint (SHA-256)** | **`00b8aa79d9fec2d0f1b24370cd3c7453105ab16e5db30806d48e1e9d19cf78a3`** |
| **G1 authorization expiry (UTC)** | **`2026-07-11T03:25:11Z`** |
| **Linked G1 fingerprint (SHA-256)** | **`d24fdbe6dbb4febbeb17d1b190776fec653462b61064d00c1c322fb8d15e2a84`** |
| **Isolation attempts authorized** | **One only** — non-reusable |
| **G2 modified** | **No** — additive supplement only |
| **G4 modified** | **No** |
| **OR-20260630-008** | **not_promoted** |
| **Strategy readiness** | **NOT READY** |
| **Capital exposure status** | **none** |
| **Planning receipt** | [`../RB-G9-20260709-AP01 PROCESS ISOLATION SCOPE AMENDMENT PLANNING — 2026-07-10.md`](../RB-G9-20260709-AP01%20PROCESS%20ISOLATION%20SCOPE%20AMENDMENT%20PLANNING%20%E2%80%94%202026-07-10.md) |
| **Sign-off gate receipt** | [`../RB-G9-20260709-AP01 PROCESS ISOLATION SCOPE AMENDMENT AUTHORIZATION — 2026-07-10.md`](../RB-G9-20260709-AP01%20PROCESS%20ISOLATION%20SCOPE%20AMENDMENT%20AUTHORIZATION%20%E2%80%94%202026-07-10.md) |

---

## 1. Amendment scope (one future isolation attempt only)

Taylor authorizes **only** a future **RB-G9-20260709-AP01 Process Isolation Gate** to expand process-stop authority **minimally** beyond the Node targets already implied by signed G2 §5 — sufficient to prevent authorized proof-support processes from respawning via verified restart wrappers.

| Field | Value |
|-------|-------|
| **Purpose** | Permit stopping verified restart wrappers that would otherwise relaunch authorized monitor/dashboard/scanner during isolation |
| **Session binding** | **`RB-G9-20260709-AP01`** exclusively |
| **Attempts authorized** | **One only** — non-reusable |
| **Relationship to G2** | **Additive** — supplements G2 process-stop precondition · does not replace or edit signed G2 |
| **Relationship to G4** | **No scope expansion** — G4 still requires isolation PASS as prerequisite |

**This signed record does not stop processes, recapture Domain A, perform C1–C3, create a runtime stub, invoke AP/N6 tooling, submit, sign, broadcast, or expose capital.**

---

## 2. Authorized Node targets (unchanged from G2 intent)

Future Process Isolation Gate may stop **only** these Solana Momentum Bot Node processes when matched by verified command identity:

| Target | Match rule |
|--------|------------|
| **monitor.js** | `node.exe` command line contains `monitor.js` · not `--loop` · not `live_executor` |
| **dashboard_server.js** | `node.exe` command line contains `dashboard_server.js` |
| **scanner_gmgn_trending.js** | `node.exe` command line contains `scanner_gmgn_trending.js` |

**live_executor.js** must remain **count 0**. Any executor process → **abort isolation**.

---

## 3. Newly authorized restart wrappers (command-identity only)

A PowerShell wrapper may be stopped **only when all** qualification requirements in §5 pass **and** it matches one of the categories below.

### 3.1 Monitor restart wrapper — **AUTHORIZED**

| Field | Value |
|-------|-------|
| **Status** | **Pre-authorized** when command identity matches |
| **Approved normalized signature** | `powershell.exe -NoExit -Command cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; while ($true) { Get-Date; node monitor.js; Start-Sleep -Seconds 60 }` |
| **Matching rule** | `powershell.exe` · repo-root `cd` · `while ($true)` loop · `node monitor.js` · `Start-Sleep` 60-second interval |
| **Planning evidence** | PID 34856 · child monitor PID 6568 · matches `Start Momentum Bot (observation).ps1` |

### 3.2 Dashboard restart wrapper — **NOT PRE-AUTHORIZED**

| Field | Value |
|-------|-------|
| **Status** | **Evidence-triggered only** |
| **Rule** | May be stopped **only if** future inventory proves `while ($true)` loop whose sole purpose is relaunching `dashboard_server.js` |
| **Current evidence** | PID 20188 is passive launcher only — **not** in amended scope today |

**Evidence-trigger normalized signature (if proven at isolation gate):**

`powershell.exe -NoExit -Command cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot; while ($true) { … node dashboard_server.js; Start-Sleep … }`

### 3.3 Scanner restart wrapper — **NOT PRE-AUTHORIZED**

| Field | Value |
|-------|-------|
| **Status** | **Positive identification required** |
| **Rule** | May be stopped **only if** future inventory proves external PowerShell `while ($true)` loop relaunching `scanner_gmgn_trending.js` |
| **Current evidence** | No active scanner restart wrapper · internal `--watch` only · stopping node **9896** sufficient |

---

## 4. Explicit exclusion — FOMO Wallet Monitor

The Windows scheduled task **`FOMO Wallet Monitor`** targeting **`FOMO-Wallet-Intel\run-monitor.bat`** is **explicitly outside** this amendment.

| Requirement | Detail |
|-------------|--------|
| **Do not stop** | **Yes** |
| **Do not disable** | **Yes** |
| **Do not modify** | **Yes** |
| **Not in isolated process delta** | **Yes** |
| **Not confused with Solana Momentum Bot monitor.js** | **Yes** |
| **Continued presence is not isolation failure** | **Yes** |

This task is a **separate project** and **not part of the armed no-submit proof process tree**.

---

## 5. Wrapper qualification requirements (all must pass)

| # | Requirement |
|---|-------------|
| **Q1** | Command identity matches approved normalized signature (§3) |
| **Q2** | Parent/child relationship proven at isolation gate time |
| **Q3** | Sole operational function is restarting **one** authorized target |
| **Q4** | Not the operator's active terminal |
| **Q5** | Not Cursor, an editor, or unrelated shell |
| **Q6** | Not shared by another application |
| **Q7** | Contains no execution, trading, signing, or transaction function |
| **Q8** | Stopping it does not mutate config or capital state |
| **Q9** | Ordinary restoration documented (`Start Momentum Bot (observation).ps1` or equivalent) |

**Ambiguous wrapper → FAIL CLOSED.** No broad inference from process name alone.

---

## 6. Explicitly prohibited termination scope

| Prohibition | Detail |
|-------------|--------|
| All PowerShell processes broadly | **Forbidden** |
| All `node.exe` processes broadly | **Forbidden** |
| PID-tree wildcard termination | **Forbidden** |
| Parent PID 32660 by ancestry alone | **Forbidden** |
| Active user terminals | **Forbidden** |
| Cursor or editor processes | **Forbidden** |
| Unrelated diagnostic shells (e.g., b2a observation loop PID 37868) | **Forbidden** unless separately governed |
| Windows scheduled tasks not explicitly named | **Forbidden** |
| Windows services | **Forbidden** |
| **FOMO Wallet Monitor** | **Forbidden** |
| **FOMO-Wallet-Intel processes** | **Forbidden** |
| Unrelated automation | **Forbidden** |
| Broadening scope during failed isolation | **Forbidden** |

---

## 7. Authorized future isolation stop order

| Step | Action |
|------|--------|
| **1** | Validate fresh Domain A baseline (≤ 30 min) |
| **2** | Verify exact process and wrapper identities against this amendment |
| **3** | Verify **FOMO Wallet Monitor** remains excluded |
| **4** | Stop authorized restart wrappers **first** |
| **5** | Verify wrappers absent |
| **6** | Gracefully stop authorized Node targets |
| **7** | Bounded wait |
| **8** | Force **only exact authorized targets** if graceful stop fails |
| **9** | Observe **≥ 10 seconds** |
| **10** | Prove no respawn |
| **11** | Derive `isolatedProcessSetHash` |
| **12** | Remain disarmed |

---

## 8. Respawn observation requirements

| Requirement | Detail |
|-------------|--------|
| **Minimum observation** | **10 seconds** after last authorized stop |
| **Pass** | Authorized targets count **0** · no matching restart wrapper reappears |
| **Fail** | Respawn · unexplained wrapper · executor appears |
| **Ancillary observation processes** | May remain if they do not relaunch stopped targets |

---

## 9. Restoration policy

| Rule | Detail |
|------|--------|
| **During isolation / arming / stub / proof** | **No restart** of stopped wrappers or Node targets |
| **After Domain C closure** | Operational restoration via documented normal startup only |
| **Restoration recording** | Separate closure action — not part of armed proof window |
| **Automatic restart during proof window** | **Forbidden** |

---

## 10. G2 preservation

| Item | Status |
|------|--------|
| Signed G2 edited in place | **No** |
| G2 C1–C3 terms | **Unchanged** |
| G2 rollback terms (D1–D11) | **Unchanged** |
| G2 arming authority | **Unchanged** |
| Amendment applies to | G2 process-isolation prerequisite interpretation only |

---

## 11. Authorization invalidation

This amendment becomes **invalid immediately** if any occur:

| # | Trigger |
|---|---------|
| **I1** | G1 expiry before valid isolation |
| **I2** | Session mismatch |
| **I3** | Linked G2 fingerprint mismatch |
| **I4** | Wrapper command identity mismatch |
| **I5** | Wrapper purpose ambiguity |
| **I6** | Unrelated process dependency discovered |
| **I7** | Scheduled-task confusion — **FOMO Wallet Monitor** targeted |
| **I8** | Broad process termination attempted |
| **I9** | Code / config / environment / auth drift |
| **I10** | Runtime stub appears before authorized G3 gate |
| **I11** | `liveArmed` true before valid isolation |
| **I12** | Execution call or `txSig` appears |
| **I13** | Position / reconciliation / recovery / capital appears |
| **I14** | Secret exposure |
| **I15** | OR-20260630-008 status change |
| **I16** | Authorization reuse after consumption |
| **I17** | Ambiguity |

---

## 12. Explicit non-authorizations (this signed record)

| Item | Status |
|------|--------|
| Process stop in this gate | **No** |
| Scheduled-task change | **No** |
| Service change | **No** |
| Domain A recapture | **No** |
| C1–C3 | **No** |
| Arming | **No** |
| Runtime-stub creation | **No** |
| Session-folder creation | **No** |
| AP / N6 invocation | **No** |
| Candidate · quote · transaction construction | **No** |
| Submit · sign · broadcast | **No** |
| Capital exposure | **No** |
| G4 scope expansion | **No** |
| G2 in-place modification | **No** |
| OR promotion | **No** |
| Readiness / profitability claim | **No** |

---

## 13. Signed risk acknowledgements

| # | Acknowledgement | Signed |
|---|-----------------|--------|
| **A1** | **G2 remains unchanged** — this amendment is additive to process-isolation scope only | **Yes** |
| **A2** | **Strategy NOT READY** — no profitability or strategy-edge claim | **Yes** |
| **A3** | **FOMO Wallet Monitor excluded** — separate project · not Solana Momentum Bot `monitor.js` | **Yes** |
| **A4** | **Monitor restart wrapper pre-authorized** by exact command identity only — not by PID alone | **Yes** |
| **A5** | **Dashboard/scanner wrappers not pre-authorized** unless positively identified at isolation gate | **Yes** |
| **A6** | **One isolation attempt only** — non-reusable | **Yes** |
| **A7** | **No restart during proof window** — restoration deferred to post–Domain C closure | **Yes** |
| **A8** | **OR-20260630-008 remains not_promoted** | **Yes** |
| **A9** | **Amendment signing does not authorize rushing** the remaining G1 window | **Yes** |

---

## 14. Taylor Cheaney — signed attestation

I, Taylor Cheaney, acknowledge and attest:

1. I have read this Process Isolation Scope Amendment for session **`RB-G9-20260709-AP01`**, linked to signed G2 at fingerprint **`00b8aa79d9fec2d0f1b24370cd3c7453105ab16e5db30806d48e1e9d19cf78a3`**.
2. This authorizes **one future Process Isolation Gate** to stop **only** verified restart wrappers whose sole function is relaunching already-authorized Solana Momentum Bot monitor, dashboard, or scanner processes — **not** broad PowerShell or Node termination.
3. **`FOMO Wallet Monitor`** (`FOMO-Wallet-Intel\run-monitor.bat`) is **explicitly excluded** and must not be stopped, disabled, or modified under this amendment.
4. Signed G2 is **unchanged**. G4 scope is **unchanged**. This amendment does **not** authorize arming, stub creation, proof execution, submit, sign, broadcast, or capital exposure.
5. Strategy readiness is **NOT READY**; I make **no** profitability or strategy-edge claim.
6. **OR-20260630-008 remains not_promoted**.

**Taylor's explicit statement (recorded):**

> I sign the Process Isolation Scope Amendment dated 2026-07-10 for session `RB-G9-20260709-AP01`. This additive authorization permits one future isolation gate to stop verified restart wrappers for authorized Solana Momentum Bot monitor, dashboard, or scanner processes only. FOMO Wallet Monitor is explicitly excluded. G2 and G4 remain unchanged. This does not stop processes, recapture Domain A, perform C1–C3, create a stub, arm production, or authorize proof execution. Strategy readiness is NOT READY; I make no profitability claim. OR-20260630-008 remains not_promoted.

| Field | Value |
|-------|-------|
| **Signed** | **Taylor Cheaney** |
| **Signature timestamp (UTC)** | **`2026-07-11T01:35:33Z`** |
| **Signature timestamp (local)** | **`Fri Jul 10 2026 19:35:33 GMT-0600 (Mountain Daylight Time)`** |

---

**Canonical path:**
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION — Process Isolation Scope Amendment — RB-G9-20260709-AP01 — 2026-07-10.md`
