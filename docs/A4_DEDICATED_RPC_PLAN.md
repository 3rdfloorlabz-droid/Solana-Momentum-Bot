# A4 — Dedicated RPC Requirements Plan (Infrastructure Integrity, Planning Only)

**Module:** TracktaOS Module 1 — Solana Momentum Bot
**Sprint:** 3 of 4 (Phase 1 — Reliability and Hardening)
**Status:** Planning only — **no code, no config edits, no live enablement, no dependencies**
**Operating constraint:** `PIPELINE_DRY_RUN` unchanged; this milestone changes no runtime behavior

**Inputs:** `live_executor.js` · `wallet_monitor.js` · `scanner_gmgn_trending.js` · `dashboard_server.js` · [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) (rank 13; A4) · [SPRINT_2_REVIEW.md](./SPRINT_2_REVIEW.md) § 11 · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) (Public RPC rate limits) · [M4_SCANNER_HEALTH_PLAN.md](./M4_SCANNER_HEALTH_PLAN.md) · [M5_HEARTBEAT_PLAN.md](./M5_HEARTBEAT_PLAN.md)

---

## 0. What this milestone is — and is not

A4 defines the **infrastructure-integrity requirements** for Solana RPC: which execution-critical paths must use a **dedicated** (non-public) RPC endpoint, which paths may tolerate the **public mainnet-beta fallback**, and how a missing dedicated endpoint must be **visible rather than silent**. It is a **requirements document**, not an implementation.

It does **not** select a provider, write code, change config, enable live trading, design failover, or add retries. It records the requirement contract that the executor already partially enforces and names the gaps that promotion must close.

> **A4 defines infrastructure integrity. It does not implement it, choose a vendor, migrate anything, or build failover.**

### Responsibility separation (must remain separate)

| Milestone | Responsibility | This doc touches it? |
|-----------|---------------|----------------------|
| **M5** | **Liveness** — are processes alive? (heartbeats) | Referenced only |
| **M9** | **Boundaries** — artifact classification | Referenced only |
| **M10** | **Policy** — retention/archive rules | Referenced only |
| **A4** (this doc) | **Infrastructure integrity** — RPC trust requirements | ✅ defines requirements |
| **A1** | **Unified state** — atomic writes, single writer | Out of scope (Sprint 4) |

A4 says *"execution truth must run on trusted infrastructure."* It does not say *how* that infrastructure is provisioned, supervised, or failed over — those are provisioning, A2, and post-A4 concerns.

---

## 1. Current RPC resolution behavior (observed truth)

Enumerated from source on 2026-06-22. Two near-identical resolvers exist (executor + wallet monitor) plus a dashboard mirror for display.

### 1.1 The dedicated-vs-public definition (already in code)

`live_executor.js` defines public endpoints by **hostname** and refuses them when dedicated is required:

```text
PUBLIC_SOLANA_RPC_ENDPOINT = "https://api.mainnet-beta.solana.com"
PUBLIC hostnames = { api.mainnet-beta.solana.com, api.devnet.solana.com, api.testnet.solana.com }
isPublicSolanaRpcEndpoint(endpoint) → hostname ∈ PUBLIC set
```

`resolveRpcEndpoint(cfg, { requireDedicated, purpose })` (live_executor.js ~L372):

- **Candidate order (executor):** `HELIUS_RPC_URL` → `SOLANA_RPC_URL` → `HELIUS_API_KEY`-derived (`https://mainnet.helius-rpc.com/?api-key=…`).
- **Selection:** first candidate whose hostname is **not** public.
- **If none dedicated and `requireDedicated`:** logs `endpointResolution` to `execution_audit.jsonl` and **throws** `"Dedicated RPC endpoint required; public mainnet-beta fallback refused."`
- **If none dedicated and not required:** returns public endpoint with `publicFallbackUsed: true`.

### 1.2 Per-path resolution (the truth table)

| # | Path | Where | `requireDedicated` | Public fallback today | Failure mode on missing dedicated |
|---|------|-------|--------------------|-----------------------|-----------------------------------|
| 1 | **Scanner discovery** | `scanner_gmgn_trending.js` via `gmgn-cli` | **N/A — no Solana RPC** | N/A (uses GMGN API, not Solana RPC) | GMGN CLI failure → M4 `scanner_health.json` `DEGRADED/STALLED` |
| 2 | **Wallet balance monitor** | `wallet_monitor.js` `getRpcUrl()` | none (always falls back) | **YES** (public allowed) | Public used → possible rate-limit → false `DISCONNECTED`; Q9 dashboard warning |
| 3 | **Executor balance check** | `live_executor.js` (~L1503) | `!isAnyDryRun(cfg)` | **YES in dry-run; NO in live** | Live: throws (dedicated required); dry-run: public tolerated |
| 4 | **Priority fee** | `getDynamicPriorityFee` (~L619) | `true` | **NO** | throws `PRIORITY_FEE_UNAVAILABLE` |
| 5 | **Simulation** | `simulateSwapTx` (~L886) | `true` | **NO** | throws `SIMULATION_FAILED` |
| 6 | **Submission** | submit path (~L1670, L1749) | `true` (+ second public re-check) | **NO** | throws `SUBMIT_FAILED`; submit refuses if `publicFallbackUsed` |
| 7 | **Confirmation** | confirm path (~L1856) | `true` | **NO** | throws `CONFIRMATION_TIMEOUT` |
| 8 | **Fill parse** | fill parse (~L1962) | `true` | **NO** | throws `FILL_PARSE_FAILED` |
| 9 | **Readiness — `dedicatedRpc`** | liveSubmission gate (~L1670) | `true` (purpose submission) | **NO** | gate blocks live submission (seen in `--status`) |
| 10 | **Readiness — "Dedicated RPC configured before real execution"** | readiness (~L2770) | `isAnyDryRun(cfg) \|\| configured` | **passes in dry-run** | dry-run passes regardless; flags for live |

**Key finding:** every **execution-critical** path (priority fee, simulation, submission, confirmation, fill parse, live balance) **already refuses public fallback** via `requireDedicated: true`. The fallback still exists — by design — only in **observation** paths (wallet monitor; executor balance check while dry-run). This matches [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) "Public RPC rate limits false negatives (partially resolved — Q9)".

### 1.3 Candidate-order inconsistency (observation, not a fix)

- Executor order: `HELIUS_RPC_URL` → `SOLANA_RPC_URL` → `HELIUS_API_KEY`-derived.
- Wallet monitor / dashboard wallet order: `HELIUS_RPC_URL` → `HELIUS_API_KEY`-derived → `SOLANA_RPC_URL`.

Functionally equivalent for dedicated-vs-public selection, but the **priority differs**. A4 records this as a consistency item for a future change; **A4 does not change it.**

---

## 2. Environment variables and dashboard visibility

| Variable / endpoint | Role today | A4 requirement framing |
|---------------------|-----------|------------------------|
| `HELIUS_RPC_URL` | Preferred dedicated endpoint (first candidate) | A *dedicated* endpoint, if its hostname is non-public. **No provider lock-in** — any non-public URL qualifies. |
| `SOLANA_RPC_URL` | Alternate endpoint | Dedicated **iff** hostname is non-public; if someone sets it to `api.mainnet-beta.solana.com` it is treated as public and refused for execution. |
| `HELIUS_API_KEY`-derived | Builds `https://mainnet.helius-rpc.com/?api-key=…` | Counts as dedicated (non-public host). Secret must stay redacted (already redacted in logs/dashboard). |
| **Public mainnet-beta** (`api.mainnet-beta.solana.com`, devnet, testnet) | Last-resort fallback | **Never** acceptable for SIMULATION or EXECUTION. Tolerated only for OBSERVATION. |
| **Q9 dashboard warnings** | `dashboard_server.js` `rpcVisibilityContext()` shows RPC source for wallet monitor + pipeline simulation, with warnings when public/missing | A4's "visible not silent" principle is **already partially delivered** here; A4 formalizes it as a requirement and a promotion gate. |

Existing Q9 warnings (read-only, already shipped):
- Wallet monitor on public → *"Public Solana RPC in use for wallet balance reads — rate limits may cause false DISCONNECTED status."*
- Pipeline simulation with no dedicated → *"No dedicated RPC configured for pipeline simulation — executor RPC stages would abort until a non-public … is set."*

---

## 3. Path classification — OBSERVATION / SIMULATION / EXECUTION

The required contract, per path class.

### 3.1 OBSERVATION

*Scanner discovery (GMGN, no Solana RPC); wallet balance monitor; executor balance check while `PIPELINE_DRY_RUN`.*

| Question | Requirement |
|----------|-------------|
| **Dedicated RPC required?** | **No.** Observation may run on public fallback. |
| **Public fallback allowed?** | **Yes.** |
| **Risks of fallback** | Rate limits → false `DISCONNECTED` / false latency; intermittent balance reads; noisy `rpc_health.json`. None of these move capital or corrupt execution truth. |
| **Failure mode expectations** | Degrade gracefully and **visibly**: dashboard shows public-fallback warning (Q9); wallet status may read `YELLOW/DISCONNECTED`; M5 heartbeats still classify liveness. An infra hiccup must read as *infra degraded*, **not** *bot failed* (principle 4). |

### 3.2 SIMULATION

*Executor `simulateSwapTx`, dynamic priority fee — the "would this transaction succeed?" path used to validate pipeline candidates before any real execution.*

| Question | Requirement |
|----------|-------------|
| **Dedicated RPC required?** | **Yes.** Simulation results are only trustworthy on dedicated infrastructure. |
| **Public fallback allowed?** | **No.** (Already enforced: `requireDedicated: true` → refusal.) |
| **Risks of fallback** | Public rate limits produce **false simulation failures/successes**, polluting observation quality and promotion statistics — "flaky pipeline observation masks real issues" (STABILIZATION rank 13). |
| **Failure mode expectations** | On missing dedicated, simulation must **abort loudly** (audit `endpointResolution` + `SIMULATION_FAILED`) and surface as **unavailable / NO DATA**, never silently run on public. **Gap to close (requirement, not built here):** the dry-run *readiness* check (#10) passes regardless of dedicated RPC; A4 requires pipeline-observation readiness to treat "no dedicated RPC" as a named, visible non-ready condition rather than a silent pass. |

### 3.3 EXECUTION

*Priority fee, submission, confirmation, fill parse, live balance check — the future live path. Gated; not enabled.*

| Question | Requirement |
|----------|-------------|
| **Dedicated RPC required?** | **Yes — mandatory.** |
| **Public fallback allowed?** | **Never.** (Already enforced; submission double-checks and refuses `publicFallbackUsed`.) |
| **Risks of fallback** | Catastrophic: dropped/stale blockhash, missed confirmations, duplicate submits, mis-parsed fills → real capital loss. Public RPC is unacceptable for any path that signs or confirms. |
| **Failure mode expectations** | Hard abort with audit trail; `liveArmed` stays false; the `dedicatedRpc` readiness gate blocks `liveSubmission` (verified in `--status`). Missing dedicated RPC is a **promotion blocker** (principle 5), not a runtime guess. |

---

## 4. Principles

1. **Execution truth must not depend on public infrastructure.** SIMULATION and EXECUTION require dedicated RPC; public fallback is refused.
2. **Observation can tolerate degraded service.** Wallet/balance/discovery may use public fallback and report degraded status.
3. **Missing dedicated RPC should be visible, not silent.** Dashboard warnings (Q9) + audit `endpointResolution` + a named promotion gate — never a silent public substitution on a trust-critical path.
4. **Infrastructure failures should not imply bot failures.** A rate-limited public endpoint reads as *infra degraded* (YELLOW/STALE/NO DATA), not *bot broken*; M5 liveness and M4 health keep the distinction honest.
5. **Promotion requires trusted infrastructure.** Live arming is gated on a configured, validated dedicated RPC; "no dedicated RPC" is an OPEN/FAIL promotion item, not a warning to ignore.

---

## 5. Infrastructure requirements (contract, not implementation)

What "dedicated RPC" **means as a requirement** (vendor-neutral):

- **R1 — Non-public hostname.** Endpoint hostname must not be in the public set (`api.mainnet-beta/devnet/testnet.solana.com`). Any compliant non-public URL satisfies the requirement — **no provider lock-in.**
- **R2 — Present for trust-critical classes.** SIMULATION and EXECUTION require a resolvable dedicated endpoint; absence → refuse (not fallback).
- **R3 — Secret-safe.** API-key-bearing URLs remain redacted in logs, audit, and dashboard (already implemented).
- **R4 — Observable state.** The presence/absence and source of the dedicated endpoint must be visible in the dashboard and recorded in `execution_audit.jsonl` `endpointResolution` events.
- **R5 — Promotion gate.** Validated dedicated RPC is a checklist item before `LIVE` (consistent with STABILIZATION pre-live gates and the M8 promotion checklist).

**Explicitly NOT requirements here:** which vendor; how many providers; failover ordering; retry/backoff; health-based provider switching; supervisor restart on RPC loss. Those are post-A4 / A2 / provisioning concerns and are **forbidden** in this milestone (§9).

---

## 6. Risks

| Risk | Likelihood | Impact | Mitigation framing |
|------|-----------|--------|--------------------|
| A4 misread as "enable live once dedicated RPC set" | Medium | High | A4 is one of several pre-live gates; dedicated RPC ≠ authorization. liveArmed stays false. |
| Treating dedicated-RPC presence as a provider mandate (Helius lock-in) | Medium | Medium | R1 is hostname-based and vendor-neutral; any non-public URL qualifies. |
| Scope creep into failover/retry/supervisor | Medium | High | §9 forbiddens; failover/retry/A2 explicitly out of scope. |
| Silent public fallback on a trust path goes unnoticed | Low (already refused) | High | Existing refusal + audit + Q9; A4 adds the readiness-visibility requirement (#10 gap). |
| Observation degradation misread as bot failure | Medium | Medium | Principle 4; M5/M4 keep infra-vs-bot distinction. |
| Candidate-order inconsistency causes operator confusion | Low | Low | §1.3 recorded as future consistency item; not changed here. |
| Config edits sneak in "to set the RPC" | Low | Medium | Planning only; no `.env`/config edits (§9). |

---

## 7. Acceptance criteria

A4 is complete when **all** hold:

1. **AC1 — Behavior documented.** Current RPC resolution for scanner, wallet monitor, pipeline simulation, and future live execution is enumerated from source. ✅ (§1)
2. **AC2 — Fallback map explicit.** Where public fallback exists vs where dedicated is already required is stated per path. ✅ (§1.2, §3)
3. **AC3 — Path classes defined.** OBSERVATION / SIMULATION / EXECUTION each have dedicated-required, public-allowed, risks, and failure-mode expectations. ✅ (§3)
4. **AC4 — Env + Q9 addressed.** `HELIUS_RPC_URL`, `SOLANA_RPC_URL`, `HELIUS_API_KEY`-derived, public mainnet-beta, and dashboard warnings are covered. ✅ (§2)
5. **AC5 — Principles + requirements stated** without provider lock-in, failover, or retries. ✅ (§4, §5)
6. **AC6 — No filesystem/runtime change.** `git status` shows **only this new doc**; posture unchanged. **Verify (§8).**
7. **AC7 — Separation preserved.** M5/M9/M10/A4/A1 responsibilities kept distinct; no live enablement. ✅ (§0)

---

## 8. Verification commands

A4 is planning-only; verification is **observational + negative**.

```powershell
# Observe current resolution truth WITHOUT changing anything (read-only):
node live_executor.js --status            # expect PIPELINE_DRY_RUN, liveArmed false,
                                          # liveSubmissionGates: "blocked: Dedicated RPC for submission ..."
node run_safety_tests.js                  # expect 4/4 passed
node test_rpc_endpoint_resolution.js      # existing focused RPC resolution test (read-only)

# Confirm planning-only footprint:
git status --short                        # expect only docs/A4_DEDICATED_RPC_PLAN.md
git diff --stat
```

### Negative verification

```powershell
# No live enablement, no config edits, no new endpoints set by this milestone:
git status --short -- .env live_config.json   # expect empty (untouched)
git diff -- live_executor.js wallet_monitor.js scanner_gmgn_trending.js dashboard_server.js  # expect empty
```

Pass = only `docs/A4_DEDICATED_RPC_PLAN.md` is new; executor/monitor/scanner/dashboard/config diffs are empty; `--status` still `PIPELINE_DRY_RUN` / `liveArmed: false`; safety 4/4.

---

## 9. "Do NOT implement during A4 planning" warnings

Hard prohibitions for this milestone:

- ❌ **Do not enable `LIVE`** or alter any arming gate, `PIPELINE_DRY_RUN`, or `liveArmed` logic.
- ❌ **Do not edit `.env`, `live_config.json`, or any config** — including "just setting `HELIUS_RPC_URL`."
- ❌ **Do not change `resolveRpcEndpoint`, `getRpcUrl`, or any RPC code.**
- ❌ **Do not introduce provider lock-in** (no hard-coding Helius as *the* required vendor).
- ❌ **Do not design or build multi-provider failover.**
- ❌ **Do not add automatic retries / backoff / circuit breakers.**
- ❌ **Do not add supervisor / restart-on-RPC-loss behavior** (that is A2).
- ❌ **Do not add dependencies, databases, or `data/`/unified-state work** (A1).
- ❌ **Do not change strategy, filters, exits, or scanner discovery.**
- ✅ **Allowed:** authoring/maintaining this requirements doc, and running read-only status/test commands.

If applying A4 ever requires editing code, setting an env var, or selecting a vendor, **stop — that is implementation/provisioning, not A4 planning.**

---

## 10. Relationship to M5, M9, M10, A4, A1

- **M5 (liveness):** answers *"is the process alive?"* — distinct from A4's *"is the infrastructure trustworthy?"* A degraded RPC may keep a process alive (M5 HEALTHY) yet untrusted for execution (A4 fails the gate).
- **M9 (boundaries) / M10 (policy):** classify and govern artifacts; orthogonal to RPC trust. `rpc_health.json` is RUNTIME LOCAL (M9) under M10 policy; A4 governs the *endpoint requirement*, not the file.
- **A4 (infrastructure integrity, this doc):** defines the dedicated-RPC requirement contract and the OBSERVATION/SIMULATION/EXECUTION classification.
- **A1 (unified state, Sprint 4):** atomic writes / single writer; independent of RPC trust. A4 must not pull in A1 work.

**Order:** liveness (M5) and trust (A4) are *visibility/requirement* layers; enforcement of state integrity (A1) and supervision/failover (A2) come later. Collapsing them (e.g., adding failover or supervisor logic under the A4 banner) reintroduces complexity Phase 1 is trying to avoid.

---

## 11. One-line A4 mandate

**Require dedicated (non-public) RPC for everything that simulates or executes, allow public fallback only for observation, make a missing dedicated endpoint loudly visible, and treat trusted infrastructure as a promotion gate — without enabling live, choosing a vendor, building failover, or touching a single line of code or config.**

---

*Sprint 3 · A4 Dedicated RPC Requirements (infrastructure integrity, planning only) · TracktaOS Module 1 · Phase 1 Stabilization · Safe default: `PIPELINE_DRY_RUN`, no live submission. Stability over convenience. Source snapshot dated 2026-06-22.*
