# M8 — Promotion Checklist Panel (Plan)

**Sprint:** 2  
**Task:** M8 (plan only — no code changes in this document)  
**Goal:** Add a **read-only Promotion Checklist** dashboard panel that tells operators whether TracktaOS Module 1 is ready for **promotion review** and clearly lists which gates remain **PASS**, **OPEN**, or **DEFERRED** — without authorizing live trading or changing execution behavior.  
**Reference:** [SPRINT_2_PLAN.md](./SPRINT_2_PLAN.md) § M8 · SC7 · [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) pre-live checklist · [OBSIDIAN_SYNC_PLAN.md](./OBSIDIAN_SYNC_PLAN.md) M8b  
**Related panels:** M7 `liveArmed` · M6a reconciliation · M2 thesis · M4 scanner health  
**Authorization record:** [LIVE_AUTHORIZATION_RECORD.md](../LIVE_AUTHORIZATION_RECORD.md) (repo root) · [MODE_TRANSITION.md](./MODE_TRANSITION.md)

---

## What M8 is supposed to accomplish

Sprint 2 shipped **honest measurement** — thesis tags, reconciliation visibility, `liveArmed` truth, scanner health, dedup persistence. Operators still lack a **single promotion narrative** that answers:

> **Is this module ready to discuss moving beyond observation — and what is still blocking live capital?**

Today, truth is scattered across automation panels, thesis stats, reconciliation cards, and `--status`. Readiness ALL PASS and automation RUNNING are easy to misread as live approval (M7 mitigates but does not consolidate promotion gates).

M8 adds **read-only aggregation for promotion storytelling** — not new gates, not arming, not config mutation.

| M8 does | M8 does not |
|---------|-------------|
| Display promotion gates grouped by **Sprint 2 / Sprint 3 / Pre-Live** | Enable live trading or change `PIPELINE_DRY_RUN` default |
| Show **PASS / OPEN / DEFERRED** (and **FAIL** for runtime health) | Add gates to `assertLiveSubmissionArmed` or `readinessChecks` |
| Explain **why** the module stays in `PIPELINE_DRY_RUN` | Merge scanner and executor filters |
| Distinguish **deferred (not built yet)** from **failed (unhealthy now)** | Auto-retry reconciliation or clear queues |
| Link to runbooks and authorization docs | Touch `live_executor.js` logic (display import only) |
| Banner: **NOT READY FOR LIVE** unless explicit pre-live human gates satisfied | Imply Ori sign-off arms live submission |

**Operator message after M8:** *“Promotion status: NOT READY — Sprint 2 measurement complete; Sprint 3 heartbeats and dedicated RPC deferred. liveArmed: false. This panel does not authorize live trading.”*

---

## Promotion requirements implied by Sprint 2 and Sprint 3

Derived from [SPRINT_2_PLAN.md](./SPRINT_2_PLAN.md), [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md), and [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).

### Sprint 2 — Honest measurement (visibility, not live)

| Requirement | Sprint task | M8 gate label | “Done” means |
|-------------|-------------|---------------|--------------|
| Thesis handoff visibility | M1 + M2 | Thesis visibility complete | New rows carry `thesisMatch`; dashboard segments thesis vs non-thesis |
| Reconciliation visibility | M6a (+ M6 polish soft) | Reconciliation visibility complete | Dashboard lists `pending_reconciliation.jsonl`; runbook linked |
| Live arming truth | M7 | liveArmed truth complete | `--status` + dashboard show `liveArmed: false` in `PIPELINE_DRY_RUN` with gate breakdown |
| Scanner discovery health | M4 | Scanner health complete | `scanner_health.json` + dashboard panel; stale/degraded distinguishable |
| Observation dedup persistence | M3 | *(Supporting — optional row)* Dedup persistence | `observation_dedup.json` survives restart (partial until A1) |
| Ori memory framework | M8b | Obsidian memory framework complete | Manual attestation / docs shipped (`OBSIDIAN_SYNC_PLAN.md`, vault notes) |
| Promotion checklist UI | M8 | *(Self — meta)* Promotion checklist published | This panel live |
| CI safety harness | Q7 | CI safety suite green | `npm test` 4/4; GitHub Actions green on `main` |
| Strategy unchanged | SC9 | Two-layer filters preserved | No filter merge in sprint diffs |

**Sprint 2 exit (hard):** M1+M2, M3, M6 (M6a minimum), M7, SC8/SC9, CI, KNOWN_ISSUES updated.  
**Sprint 2 exit (soft):** M4, M8, Ori weekly metrics.

### Sprint 3 — Operational reliability (before serious live discussion)

| Requirement | ID | M8 gate label | “Done” means |
|-------------|-----|---------------|--------------|
| Process heartbeats | M5 | Heartbeats | Heartbeat files + stale alerts (not process presence alone) |
| Archive quarantine | M9 | Archive quarantine | Non-canonical trees quarantined; manifest enforced in packaging |
| Legacy scanner retirement | M10 | *(Optional sub-row)* Archive policy | Legacy scanners moved/quarantined |
| Config change audit | A3 | *(Optional)* Config audit | Dashboard/config mutations audited |
| Dedicated RPC enforcement | A4 | Dedicated RPC | Dedicated endpoint required for pipeline readiness (not public fallback) |

**Explicitly not required for Sprint 3 entry (per Sprint 2 plan):** A1, A2, A5, dashboard auth.

### Pre-Live — Structural and human gates (Sprint 4 + authorization)

From [STABILIZATION_PLAN.md](./STABILIZATION_PLAN.md) pre-live checklist and [LIVE_AUTHORIZATION_RECORD.md](../LIVE_AUTHORIZATION_RECORD.md):

| Requirement | ID / doc | M8 gate label | “Done” means |
|-------------|----------|---------------|--------------|
| Unified state / file races | A1 | Unified state | State layer deployed; 24h concurrent stress test passed |
| Process supervisor | A2 | Supervisor | Supervisor + restart policy operational |
| Block automation on open reconciliation | A6 | *(Optional)* Reconciliation automation block | Automation blocked when queue non-empty |
| Multi-source exit pricing | A5 | *(Optional)* Exit pricing sanity | Minimum viable Jupiter vs DexScreener cross-check |
| Reconciliation drill | Runbook | Reconciliation drill complete | Operator completed drill; queue understood |
| Authorization record | LIVE_AUTHORIZATION_RECORD | Human authorization | Record signed; all milestones checked |
| Advisory review | Sprint process | Ori sign-off | Ori advisory sign-off recorded (does **not** arm live) |
| Live arming | G1–G8 | liveArmed true | **`liveArmed: true`** only when all existing submission gates pass — **human decision** |

**Critical distinction:** Pre-Live gates are **DEFERRED** during Sprint 2–3 by design — not failures.

---

## Overall panel status model

Two headline states — **never** “READY FOR LIVE”.

| Status | When | Banner color (suggested) |
|--------|------|--------------------------|
| **NOT READY** | Default Phase 1; any Sprint 2 gate OPEN/FAIL; any Sprint 3 gate not PASS; any Pre-Live gate not PASS; or `liveArmed: false` with promotion path incomplete | Red / amber strip |
| **READY FOR REVIEW** | All Sprint 2 gates **PASS**; all Sprint 3 gates **PASS**; all Pre-Live structural gates **PASS** (A1, A2, A4, CI, recon drill); **Human authorization** and **Ori sign-off** still **OPEN** | Amber strip — “review only” |

**Rules:**

1. **`liveArmed: true` alone does not set READY FOR REVIEW** — human authorization must still be OPEN until record signed.
2. **`READY FOR REVIEW` ≠ live approval** — copy must say: *“Schedule authorization workflow; do not arm live from dashboard.”*
3. If any runtime probe **FAIL**s (e.g. scanner STALLED, reconciliation queue non-empty in live context, CI unknown red), overall status stays **NOT READY**.
4. **DEFERRED** gates do not FAIL the panel — they explain future work. Sprint 3 gates show **DEFERRED** until Sprint 3 ships, then become **OPEN** until PASS.

```text
NOT READY (default)
  └─ Sprint 2: any OPEN/FAIL
  └─ Sprint 3: any DEFERRED/OPEN/FAIL (after Sprint 2 complete)
  └─ Pre-Live: any DEFERRED/OPEN/FAIL
  └─ liveArmed false + PIPELINE_DRY_RUN (expected — explain, don't treat as FAIL)

READY FOR REVIEW (rare in Phase 1)
  └─ All structural gates PASS
  └─ Human authorization OPEN
  └─ Ori sign-off OPEN
  └─ liveArmed still false until humans authorize
```

---

## Gate state vocabulary

| State | Meaning | Operator copy |
|-------|---------|---------------|
| **PASS** | Requirement met for current phase | Green — “Shipped / verified” |
| **OPEN** | In scope, not yet complete, or needs operator action | Amber — “Remaining work or attestation” |
| **DEFERRED** | Planned future sprint; not a failure | Muted — “Not implemented yet — Sprint N” |
| **FAIL** | Runtime unhealthy now (distinct from deferred) | Red — “Needs attention now” |

**Examples:**

| Gate | Sprint 2 mid-flight | After M1–M4 shipped | Sprint 3 not started |
|------|---------------------|---------------------|----------------------|
| Heartbeats | DEFERRED | DEFERRED | OPEN → PASS when M5 ships |
| Thesis visibility | OPEN | PASS (if runtime probe ok) | PASS |
| Scanner health | OPEN | PASS if `scanner_health.json` fresh; **FAIL** if STALLED | PASS/FAIL |
| Unified state | DEFERRED | DEFERRED | DEFERRED until Sprint 4 |

**Do not label DEFERRED items as FAIL.** Subtitle: *“Deferred — not implemented yet (Sprint 3).”*

---

## Why TracktaOS remains in `PIPELINE_DRY_RUN`

Fixed explanatory block (always visible):

```text
Phase 1 default: PIPELINE_DRY_RUN

The bot runs full Jupiter quote → build → simulate without signing or submitting.
Paper trades and pipeline observations accumulate research data.
Live capital is not the default outcome.

This panel tracks promotion readiness toward a future authorization workflow.
PASS gates do not change executionMode.
Only human authorization + satisfied liveArmed gates may move toward LIVE — outside this panel.
```

Pull `executionMode`, `operationalPosture`, and `liveArmed` from existing `liveExecutor.computeLiveArmedStatus()` display import (same as M7 — **read only**).

---

## Proposed dashboard panel — `promotionChecklistPanel()`

### Layout (HTML structure)

```text
<section class="panel promotion-panel">
  <h2>Promotion Checklist</h2>
  <div class="promo-banner promo-not-ready | promo-review">
    NOT READY FOR LIVE PROMOTION  |  READY FOR REVIEW (NOT AUTHORIZED FOR LIVE)
  </div>
  <div class="promo-subtitle">Informational only — does not arm live trading or change executionMode.</div>

  <div class="promo-why-dry-run">… PIPELINE_DRY_RUN explanation …</div>

  <div class="promo-runtime">
    executionMode · operationalPosture · liveArmed · liveSubmission
  </div>

  <h3>Sprint 2 — Measurement & visibility</h3>
  <table> gate | status | detail </table>

  <h3>Sprint 3 — Operational reliability</h3>
  <table> … all DEFERRED until Sprint 3 … </table>

  <h3>Pre-Live — Structural & authorization</h3>
  <table> … DEFERRED + Human/Ori OPEN … </table>

  <div class="promo-links">
    LIVE_AUTHORIZATION_RECORD.md · MODE_TRANSITION.md · RECONCILIATION_RUNBOOK.md · OBSIDIAN_SYNC_PLAN.md
  </div>

  <div class="promo-footer">
    Readiness ALL PASS and automation RUNNING do not mean live armed.
    Ori advises; humans authorize capital.
  </div>
</section>
```

Reuse existing CSS patterns: `.panel`, `.wc-*` wallet/RPC badges, `.recon-*` reconciliation hints, `.ac-live-armed-strip` tone (do not duplicate M7 strip — **link** to it: “See Live Automation above for gate breakdown”).

### Gate registry (static + runtime probes)

Implement as a constant array in **`dashboard_server.js` only**. Each gate:

```javascript
{
  id: "thesis_visibility",
  group: "sprint2",
  label: "Thesis visibility complete",
  sprint: 2,
  evaluate: (ctx) => ({ state: "PASS"|"OPEN"|"DEFERRED"|"FAIL", detail: "..." })
}
```

**Suggested runtime probes (dashboard-only — no executor edits):**

| Gate ID | Probe source | PASS condition | FAIL condition |
|---------|--------------|----------------|----------------|
| `thesis_visibility` | Recent `pipeline_candidates.jsonl` or paper rows | ≥1 recent row with `thesisMatch` boolean present | Parse error |
| `reconciliation_visibility` | Panel shipped (always true post-M6a) + `pending_reconciliation.jsonl` | M6a code present; queue empty or explained in PIPELINE_DRY_RUN | N/A in dry-run unless rows + no runbook link |
| `livearmed_truth` | `liveExecutor.computeLiveArmedStatus(cfg)` | Function exported; dashboard shows strip; `liveArmed` computed | Executor module missing |
| `scanner_health` | `scanner_health.json` + `classifyScannerHealth` | File exists; status HEALTHY or DEGRADED with recent `lastScanAt` | STALLED / NO DATA while watch expected |
| `dedup_persistence` | `observation_dedup.json` exists OR audit-only seed documented | File readable or empty queue acceptable | — (OPEN until operator restart test) |
| `obsidian_memory` | Static | **PASS** after M8b (manual attestation string in panel) | OPEN pre-M8b |
| `promotion_panel` | Static | **PASS** when this panel ships | OPEN during M8 implementation |
| `ci_safety` | Static **OPEN** with hint “Confirm GitHub Actions on main” OR optional `process.env.CI` N/A | Manual operator checkbox in copy | — |
| `heartbeats` | Static | DEFERRED until M5 | — |
| `archive_quarantine` | Static | DEFERRED until M9 | — |
| `dedicated_rpc` | `resolveRpc`-style read from env via dashboard RPC panel logic | Dedicated env set | OPEN if public fallback only |
| `unified_state` | Static | DEFERRED until A1 | — |
| `supervisor` | Static | DEFERRED until A2 | — |
| `human_authorization` | Check `LIVE_AUTHORIZATION_RECORD.md` milestones | Manual OPEN — “Record not signed” | — |
| `ori_signoff` | Static OPEN | Always OPEN until human records advisory sign-off in doc/vault | — |

**Conservative default:** Sprint 3 and Pre-Live structural gates render **DEFERRED** with sprint label until code/constants updated in a future dashboard-only patch (no auto-flip on calendar).

### Obsidian memory gate (M8b)

Cannot probe Obsidian vault from Node. Use:

- **PASS** with detail: *“M8b docs + manual vault sync (`C:\TracktaOS\Ori\`). Attest on sprint close.”*
- No filesystem check of Obsidian path in production dashboard (optional dev-only `fs.existsSync` behind comment — **not recommended** for portable repo).

---

## Section placement recommendation

**Recommended (primary):** Insert **`promotionChecklistPanel()`** immediately **after `reconciliationPanel()`** and **before `walletConnectionPanel()`** in `renderDashboard()` (~line 2547).

```text
systemStatusPanel()
scannerHealthPanel()
phase1ReadinessPanel()
liveAutomationControlPanel()    ← M7 liveArmed detail
reconciliationPanel()           ← M6a truth
promotionChecklistPanel()       ← M8 NEW — synthesizes promotion narrative
walletConnectionPanel()
rpcHealthPanel()
…
thesisPanel()                   ← M2 detail (below fold)
```

**Rationale:**

1. Operator sees **liveArmed** and **reconciliation** before promotion summary (causal order).
2. Avoids top-of-page alarm fatigue before system status.
3. Keeps promotion checklist in the **ops strip** with wallet/RPC context below.

**Alternative (if operators miss panel):** Place **after `systemStatusPanel()`** as second panel — higher visibility, but duplicates posture before M7/M6 context. Use only if user testing shows missed checklist.

**Do not place below `thesisPanel()`** — too far from ops controls; thesis stats alone mislead promotion narrative.

---

## Wording recommendations

### Headlines

| Element | Wording |
|---------|---------|
| Panel title | **Promotion Checklist** |
| Default banner | **NOT READY FOR LIVE PROMOTION** |
| Review banner | **READY FOR REVIEW — NOT AUTHORIZED FOR LIVE** |
| Subtitle | *This panel is informational only. It does not change executionMode, arm live submission, or replace human authorization.* |

### Per-state labels

| State | Badge text |
|-------|------------|
| PASS | **PASS** — requirement met |
| OPEN | **OPEN** — remaining work |
| DEFERRED | **DEFERRED** — Sprint N (not implemented yet) |
| FAIL | **FAIL** — needs attention now |

### Anti-confusion footer (required)

```text
• PASS on this checklist does not authorize live trading.
• liveArmed: false is expected during PIPELINE_DRY_RUN observation.
• Readiness ALL PASS allows pipeline observation — not on-chain submission.
• Empty reconciliation queue during dry-run is normal; non-empty queue requires runbook before any live discussion.
• Ori sign-off is advisory; humans authorize capital via LIVE_AUTHORIZATION_RECORD.md.
```

### Links (repo root paths in `<code>`)

- `LIVE_AUTHORIZATION_RECORD.md`
- `RECONCILIATION_RUNBOOK.md`
- `docs/MODE_TRANSITION.md`
- `docs/OBSIDIAN_SYNC_PLAN.md`
- `docs/SPRINT_2_PLAN.md`

---

## Implementation scope (future coding pass)

**Files touched:** `dashboard_server.js` **only**

| Work | File |
|------|------|
| `PROMOTION_GATES` registry + `evaluatePromotionContext()` | `dashboard_server.js` |
| `promotionChecklistPanel()` HTML | `dashboard_server.js` |
| CSS classes `.promo-*` in `sharedStyles()` | `dashboard_server.js` |
| Insert in `renderDashboard()` | `dashboard_server.js` |
| Optional unit test `test_promotion_checklist.js` | New file — **only if Ori approves** safety suite extension |

**Imports (read-only, already exported):**

- `liveExecutor.computeLiveArmedStatus(cfg)`
- `liveExecutor.loadConfig()` or dashboard’s existing config read
- `scannerHealthModule.classifyScannerHealth` + `SCANNER_HEALTH_FILE` read
- `readJsonLines(PENDING_RECONCILIATION_FILE)`
- Existing `loadConfig()` / `ROOT` paths

**No changes to:**

- `live_executor.js` gate logic
- `scanner_gmgn_trending.js`
- `live_config.json` schema
- Strategy / filters / exits
- Archive folders
- Obsidian vault (manual)

---

## Risks

| Risk | Level | Mitigation |
|------|-------|------------|
| **False live readiness** — operators treat PASS as approval | **High** | NOT READY banner default; footer anti-confusion; never show “ARM LIVE” button |
| **READY FOR REVIEW misread as go-live** | **High** | Always pair with “NOT AUTHORIZED FOR LIVE”; keep human/Ori gates OPEN |
| **DEFERRED shown as FAIL** | Medium | Separate badge colors and copy; unit test gate classifier |
| **Scope creep — new gates in executor** | **High** | M8 display-only constraint in PR review; static registry in dashboard |
| **Duplicating M7 strip** | Low | Cross-link Live Automation panel; promotion panel summarizes gates table only |
| **Obsidian gate false PASS** | Low | Manual attestation copy; no vault filesystem probe in CI |
| **CI gate unknown** | Medium | Default OPEN with “confirm Actions on main”; do not claim PASS without probe |
| **Thesis probe on empty market** | Low | PASS if schema present on any row OR “no candidates yet — schema ready” |
| **Dashboard-only test gap** | Medium | Manual browser checklist; optional lightweight test of `evaluatePromotionContext` pure functions |

---

## Acceptance criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| AC1 | Panel titled **Promotion Checklist** visible on dashboard | Browser `http://localhost:3000` |
| AC2 | Default overall status **NOT READY FOR LIVE PROMOTION** in `PIPELINE_DRY_RUN` | Visual + config smoke |
| AC3 | Sprint 2 gates listed with **PASS/OPEN/DEFERRED/FAIL** | Inspect table rows |
| AC4 | Sprint 3 gates show **DEFERRED** (not FAIL) before Sprint 3 | Copy review |
| AC5 | Pre-Live gates show **DEFERRED** + Human/Ori **OPEN** | Copy review |
| AC6 | **`PIPELINE_DRY_RUN` explanation** block always visible | HTML inspect |
| AC7 | **`liveArmed: false`** shown; footer explains expected disarmed state | Compare `--status` |
| AC8 | **No executor behavior change** | `node run_safety_tests.js` 4/4; `git diff live_executor.js` empty |
| AC9 | **No strategy / filter changes** | SC9 review |
| AC10 | Links to authorization + runbook docs present | Click/copy paths |
| AC11 | Panel does **not** include Arm Live / Enable Submission buttons | HTML inspect |
| AC12 | SC7 — operator walkthrough without reading executor source | Operator sign-off |
| AC13 | Archive folders untouched | `git diff` scope |
| AC14 | `node --check dashboard_server.js` passes | Syntax |
| AC15 | KNOWN_ISSUES updated (paper ≠ live edge — partial via M8) | Doc review |

---

## Verification commands (coding pass)

```powershell
# Repo root
cd C:\TracktaOS\Projects\Active\Solana-Momentum-Bot

# 1. Syntax
node --check dashboard_server.js

# 2. Safety suite — executor unchanged
node run_safety_tests.js
# Expect: 4/4 passed

# 3. Status baseline
node live_executor.js --status
# Expect: executionMode: PIPELINE_DRY_RUN, liveArmed: false, operationalPosture: PIPELINE_OBSERVING

# 4. Dashboard
node dashboard_server.js
# Open http://localhost:3000
# Expect: Promotion Checklist panel after Reconciliation
# Expect: NOT READY FOR LIVE PROMOTION banner
# Expect: Sprint 3 + Pre-Live structural gates DEFERRED
# Expect: No arm-live control

# 5. Diff scope
git diff --stat
# Expect: dashboard_server.js (+ optional test_promotion_checklist.js, KNOWN_ISSUES.md, docs/M8_PROMOTION_CHECKLIST_PLAN.md)
# Expect: live_executor.js NOT modified

# 6. Gate spot-check (after Sprint 2 tasks shipped)
# Expect PASS: thesis visibility, liveArmed truth, reconciliation visibility, scanner health (if scan run)
# Expect OPEN: human authorization, ori sign-off
# Expect DEFERRED: heartbeats, archive quarantine, unified state, supervisor (pre-Sprint 3/4)
```

---

## Implementation checklist (future)

- [ ] Add `PROMOTION_GATE_GROUPS` + pure `evaluatePromotionGate(gate, ctx)` helpers
- [ ] Build `evaluatePromotionContext()` from config, files, executor export, scanner health
- [ ] Implement `promotionChecklistPanel()`
- [ ] Add `.promo-*` styles consistent with existing dashboard
- [ ] Insert panel in `renderDashboard()` after `reconciliationPanel()`
- [ ] Manual browser verification per AC table
- [ ] Update `KNOWN_ISSUES.md` (paper ≠ live edge — M8 checklist partial)
- [ ] Update Obsidian `[[Promotion Checklist]]` note to reference dashboard panel (manual vault sync)
- [ ] Single commit: e.g. “Add read-only promotion checklist panel (Sprint 2 M8)”

---

## Rollback

Revert M8 commit. Dashboard loses promotion panel; M7/M6/M2/M4 panels unchanged. No execution impact.

---

## Relationship to M8b

| Task | Scope |
|------|-------|
| **M8b** | Obsidian vault memory framework — manual sync, `C:\TracktaOS\Ori\` notes |
| **M8** | Dashboard promotion checklist panel — runtime visibility |

M8 **Obsidian memory framework complete** gate in the panel references M8b doc/vault attestation. M8b does not implement dashboard UI. See [OBSIDIAN_SYNC_PLAN.md](./OBSIDIAN_SYNC_PLAN.md).

---

## Summary

| Question | Answer |
|----------|--------|
| What is promotion status? | **NOT READY** (default) or **READY FOR REVIEW** (structural gates pass; human auth still open) |
| Does PASS mean live? | **No** — ever |
| Why `PIPELINE_DRY_RUN`? | Phase 1 observation default — explained in panel |
| Minimal code touch? | **`dashboard_server.js` only** |
| New safety gates? | **No** |
| Enables live? | **No** — visibility only |
| Builds on | M2, M6a, M7, M4, M8b |

---

*Sprint 2 M8 · Promotion Checklist panel plan · Read-only · No executor changes · No live enablement*
