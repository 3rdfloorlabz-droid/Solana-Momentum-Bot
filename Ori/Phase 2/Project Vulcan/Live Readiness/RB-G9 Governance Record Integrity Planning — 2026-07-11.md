# RB-G9 Governance Record Integrity Planning — 2026-07-11

Status:
**PLANNING COMPLETE — HYBRID MODEL RECOMMENDED**

Mode:
**PLANNING, INVENTORY, AND READ-ONLY VERIFICATION ONLY**

Planning start UTC:
**`2026-07-12T03:00:18.736Z`**

Planning start local (MDT):
**`Sat Jul 11 2026 21:00:18 GMT-0600 (Mountain Daylight Time)`**

Planning completion UTC:
**`2026-07-12T03:02:37.928Z`**

Planning completion local (MDT):
**`Sat Jul 11 2026 21:02:37 GMT-0600 (Mountain Daylight Time)`**

Upstream acceptance:
[`Decisions/DECISION — RB-G9 Armed Continuum Remediation Acceptance — 2026-07-11.md`](Decisions/DECISION%20%E2%80%94%20RB-G9%20Armed%20Continuum%20Remediation%20Acceptance%20%E2%80%94%202026-07-11.md)

Governance/timing review source:
[`RB-G9 AP04 Timing Remediation and Proof Retry Planning — 2026-07-11.md`](RB-G9%20AP04%20Timing%20Remediation%20and%20Proof%20Retry%20Planning%20%E2%80%94%202026-07-11.md) §3.3 · §9 *(prior `RB-G9 Governance Integrity and Timing-Pressure Review`)*

Capital exposure:
**none**

---

## 1. Planning result

| Field | Value |
|-------|-------|
| **Recommended integrity model** | **HYBRID (Option D)** |
| **Canonical ownership** | **Repo-local Ori authoritative for bot governance; `analysis/` authoritative for machine receipts; vault Ori summary-only** |
| **Implementation readiness** | **CONDITIONALLY READY AFTER SENSITIVE-DATA REVIEW** |
| **Sequencing vs F4** | **B — planning accepted; F4 may plan in parallel; AP04 blocked until governance integrity + F4 complete** |
| **Recommended next gate** | **RB-G9 Governance Sensitive-Data Review** |

**No Git migration, staging, commit, hash checkpoint, or lock removal performed in this gate.**

---

## 2. Repository identity (read-only)

| Field | Value |
|-------|-------|
| Repo root | `C:\TracktaOS\Projects\Active\Solana-Momentum-Bot` |
| Branch | `github-clean` |
| HEAD | `0d97d5bd89276977db16f18f048243e33dd8270b` |
| Working tree | ~101 modified/untracked entries repo-wide; **all `Ori/` untracked** |
| `.git/index.lock` | **Present** · size **0 bytes** · mtime **`2026-07-06T04:18:20Z`** |
| Active `git` process | **Yes** — PID observed at planning time *(IDE/background Git integration)* |
| `git ls-files Ori/` | **0** |

---

## 3. Repo-local Ori inventory

| Metric | Value |
|--------|-------|
| **Total files** | **243** |
| **Tracked** | **0** |
| **Untracked** | **243** |
| **Git-ignored under Ori** | **2** |
| **Total size** | **~2.72 MB** |

### Extension counts

| Extension | Count |
|-----------|-------|
| `.md` | 238 |
| `.json` | 5 |

### Largest files

| Size | Path |
|------|------|
| ~126 KB | `Ori/Operations/Cursor Run Log.md` |
| ~38 KB | `RB-G9 Armed Continuum Remediation Implementation Planning — 2026-07-11.md` |
| ~28 KB | Several Live Readiness planning/review records |

### Mtime-cluster findings

| Cluster | Files | Interpretation |
|---------|-------|----------------|
| **`2026-07-11 21:33 UTC`** | **228** | Bulk documentation pass — **Tier 4 weak provenance** |
| Smaller clusters | 15 | Gate-time writes, continuum remediation records, A4/posture checks |

**Files with internal ISO timestamps:** **99** (Tier 1–3 supporting metadata)

### Governance category estimate

| Category | Approx. count |
|----------|---------------|
| Canonical index (`README`) | 3 |
| Authorization | 24 |
| Decision | 7 |
| Session artifacts | 10 |
| Gate / authorization gate records | 50 |
| Planning | 32 |
| Implementation | 21 |
| Review / independent review | 27 |
| A4 Dedicated RPC subtree | 16 |
| Run log | 1 |
| Uncertain / mixed | 52 |

### Index coverage

| Check | Result |
|-------|--------|
| `Authorizations/README.md` | **Strong** — fingerprints, closure links, status |
| `Decisions/README.md` | **Present** — 7 decisions indexed |
| `Sessions/README.md` | **Present** — AP01/AP02/AP03 disposition |
| Missing indexed files | **Not exhaustively verified** — no broken-link scan executed |
| Present but not indexed | **Many gate receipts** outside `Decisions/` and `Authorizations/` — acceptable as operational receipts if cross-linked |

---

## 4. Machine evidence location (outside Ori/)

**Canonical timing/capital machine receipts live in `analysis/`, not `Ori/`.**

Observed RB-G9 JSON receipts (21 files): AP01, AP02, AP03 manifests/receipts including:

- `rb_g9_20260711_ap03_armed_no_submit_proof_receipt.json`
- `rb_g9_20260711_ap03_process_isolation_receipt.json`
- `rb_g9_20260711_ap03_arming_transition_receipt.json`
- `rb_g9_20260711_ap03_emergency_domain_c_closure_receipt.json`
- `rb_g9_20260711_ap03_final_domain_a_receipt.json`
- AP02 closure/authorization receipts
- AP01 isolation/domain-a receipts

**Repo-local Ori JSON:** 5 files under `Sessions/` (templates + session sidecars) — **not** primary AP-chain timing evidence.

**Vault-level Ori:** `C:\TracktaOS\Ori` — **288 files** — separate ledger; must not be treated as bot-canonical without explicit bridge.

---

## 5. Evidence-strength model

### Tier 1 — strongest (may prove timing, binding, capital posture)

- Machine-generated JSON receipts in `analysis/` with `receiptSha256`, internal UTC timestamps, authorization fingerprints
- Append-only hash-chained JSONL event logs (`armed_continuum_events.js` design; continuum tests verify chain)
- Cryptographic content hashes and binding fingerprints recorded at signing/consumption
- Config/state fingerprints embedded in receipts (`armingBaselineHashSha256`, `isolatedProcessSetHashSha256`)

**May prove:** timing sequence, fail-closed outcomes, authorization binding at execution, disarmed posture at receipt time.

**May not prove:** narrative intent, human approval psychology, future readiness.

### Tier 2 — strong (may prove policy and closure if cross-linked)

- Signed authorization bodies with preserved `fingerprint` / `fingerprintAtSignOff` in index and machine receipts
- Append-only indexes (`Authorizations/README.md`, `Decisions/README.md`, `Sessions/README.md`)
- Git commit history **once established**

**May prove:** what was signed, closure status, non-reuse rules, cross-links to machine evidence.

**May not prove:** exact file content unchanged without hash or Git.

### Tier 3 — supporting (human-readable derivative)

- Post-disarm narratives, gate receipts, closure Markdown generated from machine evidence
- Planning/implementation/review records with explicit upstream citations

**May prove:** human interpretation **if** cites Tier 1/2 hashes/paths.

**May not prove:** timing or binding alone.

### Tier 4 — weak (non-authoritative)

- Filesystem mtime (especially 228-file bulk cluster `2026-07-11T21:33:54Z`)
- Bulk-copied prose without receipt citation
- Uncited summaries

**May not prove:** chronology, authenticity, or non-mutation.

---

## 6. Current hash-link strengths and gaps

### Strengths observed

| Link | Status |
|------|--------|
| Machine receipts hash config/state | **Yes** — e.g. AP03 proof receipt contains baseline/isolation hashes + auth fingerprints |
| Authorization index preserves fingerprints | **Yes** — truncated SHA-256 in `Authorizations/README.md` |
| Closure records reference prior fingerprints | **Yes** — AP01/AP02/AP03 closure chains indexed |
| Continuum event log hash chain | **Yes** — tested in `test_armed_continuum_events.js` |
| Receipt self-hash (`receiptSha256`) | **Yes** — continuum + RB-G9 receipt modules |

### Gaps (no mutation detection today)

| Gap | Impact |
|-----|--------|
| **Entire `Ori/` untracked** | Silent Markdown edit undetectable |
| **228-file mtime cluster** | Filesystem time misleading for chronology |
| **Split ledger** (`Ori/` prose vs `analysis/` JSON) | Requires explicit cross-link discipline |
| **No content hashes on Markdown** | Narratives can drift without detection |
| **No append-only manifest for Ori tree** | No offline tamper-evident snapshot |
| **Vault vs repo-local duplication risk** | Two Ori trees without enforced ownership |
| **Absolute paths in ~25 files** | Portability and hygiene risk pre-commit |
| **Username paths in ~30 files** | Environment coupling |

---

## 7. Option evaluations

### Option A — full Git tracking of repo-local Ori

| Aspect | Assessment |
|--------|------------|
| Include | All 243 Ori files |
| Benefits | Full diff history, blame, branch protection, standard tooling |
| Drawbacks | Large initial commit; mtime noise irrelevant but history starts at baseline only |
| Bloat | Low (~2.7 MB) — acceptable |
| Generated noise | `Cursor Run Log.md` grows — still committable with review |
| Secret risk | Medium without screening — policy text matches "secret" keywords widely |
| Path leakage | Medium — absolute paths present |
| Machine JSON in Ori | Only 5 session sidecars — commit yes |
| Event logs | Continuum JSONL in `analysis/` during runs — **exclude** from baseline |
| Migration | Single baseline commit after screening |
| Rollback | `git revert` + off-machine backup |

**Verdict:** Viable but **too coarse** without excludes; secret/path risk elevated.

### Option B — selective Git tracking

**Include:**
- `Ori/**/README.md` indexes
- `Ori/**/Decisions/**`
- `Ori/**/Authorizations/**` (signed bodies + index)
- `Ori/**/Sessions/**` (session folders, templates, sidecar JSON)
- Planning / implementation / review / gate receipts under Live Readiness
- `Ori/Operations/Cursor Run Log.md`
- Selected A4/posture records if bot-relevant

**Exclude:**
- Volatile runtime artifacts
- `analysis/*.jsonl` event logs from live runs
- Temp stubs, process snapshots
- Secrets, `.env`, keys, credentials
- Duplicated vault mirrors
- Large generated logs outside Ori policy

**Machine receipts in `analysis/`:** **Commit yes** for RB-G9 canonical JSON (21 files) — separate from Ori tree.

**Event logs:** **Do not commit** live continuum JSONL; commit only test/fixture logs if ever needed.

**Conceptual `.gitignore` strategy:**
```
# exclude volatile analysis runtime
analysis/*_events.jsonl
analysis/*.tmp
# never commit secrets
.env
**/secrets/**
# optional: exclude vault mirror paths if ever copied in-repo
```

**Verdict:** **Core of recommended hybrid.**

### Option C — hash checkpointing without Git

**Design:**
- Append-only manifest: `Ori/governance/manifests/checkpoint-YYYYMMDD-HHMMSS.jsonl`
- Fields: `path`, `size`, `sha256`, `internalTimestamp` (if present), `manifestHash`, `previousManifestHash`
- Signer: human attestation file or GPG optional
- Cadence: pre-AP04 baseline + after each governance gate
- Verify: `node scripts/verify_governance_manifest.js` *(future)*
- Off-machine copy: encrypted backup

**Limitations:** No line-level diff; harder collaboration; manual cadence discipline; no standard PR workflow.

**Verdict:** **Valuable as supplement**, insufficient alone.

### Option D — hybrid (RECOMMENDED)

| Layer | Mechanism |
|-------|-----------|
| **Git** | Selective tracking per Option B for Ori + `analysis/rb_g9*.json` |
| **Checkpoint manifest** | Append-only SHA-256 tree manifest at baseline and each governance gate |
| **Volatile excluded** | Runtime JSONL, temp analysis, live stubs |
| **Vault bridge** | One-way summary links from `C:\TracktaOS\Ori` → repo paths + receipt hashes |
| **Hash chain** | Manifest chains to previous; machine receipts retain `receiptSha256` |

**Boundaries:**
- **Authoritative bot governance prose:** repo-local `Ori/`
- **Authoritative machine timing evidence:** `analysis/rb_g9*.json`
- **Authoritative cross-project doctrine:** vault Ori — links only, no editable AP-chain duplicate

---

## 8. Canonical ownership model

### Repo-local Ori (`Solana-Momentum-Bot/Ori/`)

| Owns | Does not own |
|------|--------------|
| Project Vulcan Live Readiness governance | Cross-project doctrine |
| Authorizations, decisions, sessions (Markdown) | Duplicate signed AP bodies in vault |
| Gate/planning/implementation/review receipts | Live runtime state |
| Cursor Run Log | Machine receipt primary store |

### `analysis/` (repo root)

| Owns | Does not own |
|------|--------------|
| RB-G9 machine JSON receipts | Human narratives |
| Drill captures (non-canonical unless promoted) | Authorization prose |

### Vault-level Ori (`C:\TracktaOS\Ori/`)

| Owns | Does not own |
|------|--------------|
| Cross-project summaries | Bot-specific AP01/AP02/AP03 editable copies |
| Doctrine, posture at TracktaOS level | Machine receipt authority |
| Links to canonical bot paths + hashes | Second active authorization ledger |

### Sync rules

| Rule | Value |
|------|-------|
| Record origin | Created where gate executes (repo-local for Vulcan) |
| Authoritative path | Repo-local for bot; vault gets summary stub only |
| Mirror behavior | **One-way** repo → vault summary |
| Sync direction | **No two-way editable sync** |
| Conflict resolution | Repo-local wins for bot facts; vault wins for doctrine |
| Duplicate prevention | Vault entries must cite repo path + hash, not copy signed bodies |
| Crosslink format | `canonical: repo://Ori/...` + `receiptSha256: ...` + `fingerprint: ...` |
| Archival | `Fork Rejected/`, closure records immutable; status appended not replaced |

---

## 9. Machine-receipt policy

| Rule | Decision |
|------|----------|
| Canonical JSON | `analysis/rb_g9*.json` for AP-chain evidence |
| Commit to Git | **Yes** — after sensitive-data review |
| JSONL event logs | **No** for live runs; test fixtures optional |
| Hash recording | `receiptSha256` required; narratives must cite |
| Narrative linkage | Mandatory `sourceReceipt` path + hash in post-disarm Markdown |
| Missing machine evidence | Fail-closed — no narrative may claim timing without receipt |
| Schema versions | `schemaVersion` field preserved; breaking changes need new gate |
| Append-only | New receipts added; old receipts never rewritten |

---

## 10. Narrative-record policy

| Rule | Requirement |
|------|-------------|
| Generation timing | **After disarm only** for armed-session narratives |
| Citation | Machine receipt path + `receiptSha256` |
| Authorization fingerprint | Original `fingerprintAtSignOff` preserved in index; body immutable after sign |
| Closure | Append closure record; update index status; do not silently delete sign-off text |
| mtime | **Never** used as proof |
| Corrections | New amendment record; no silent rewrite |
| Metadata | `generatedAtUtc`, `sourceReceiptHash`, `author`/`tool` required on generated narratives |

---

## 11. Authorization lifecycle integrity

| Stage | Policy |
|-------|--------|
| Original signed body | **Immutable** after sign-off |
| Original fingerprint | Recorded in authorization file + index + machine receipt at use |
| Post-use status | Updated in **index** and **separate closure record** |
| Closure | Dedicated closure Markdown + machine closure receipt where applicable |
| Supersession | New authorization; old marked SUPERSEDED/CLOSED in index |
| Non-reuse | Mechanical markers: `do not reuse`, `CONSUMED/CLOSED` |
| AP01/AP02/AP03 migration | Preserve as historical; fingerprints already in index and JSON |

**Existing records:** **not rewritten in this gate.**

---

## 12. Sensitive-data screening (read-only)

| Category | Count / finding | Risk | Treatment |
|----------|-----------------|------|-----------|
| Policy keyword matches (`secret`, `api_key`, etc.) | **~120 files** | **Low** — prose policy, not values | Verify no raw values in dedicated review |
| Absolute local paths (`C:\TracktaOS`) | **~25 files** | **Medium** | Normalize to repo-relative before commit |
| Username paths (`\Users\nalle`) | **~30 files** | **Medium** | Redact or genericize before commit |
| Email addresses | **0 detected** | **Low** | — |
| Private keys / seed phrases | **0 confirmed values** | **Unknown without deep scan** | Mandatory secret scanner before commit |
| Public wallet addresses | **Some** in auth/test refs | **Low** — allowed per R15 decision | Keep |
| RPC credential values | **0 confirmed in Ori** | **Low** | Scanner required |
| Large base64 payloads | **None significant in Ori** | **Low** | Size cap in pre-commit |
| Volatile runtime artifacts in Ori | **0** | **Low** | Keep excluded |

**No secret values printed in this gate.**

---

## 13. Pre-commit screening design (future implementation)

1. Secret scanner (gitleaks or custom) — block keys/tokens
2. Path allowlist — `Ori/`, `analysis/rb_g9*.json` only for governance baseline
3. Extension allowlist — `.md`, `.json` primarily
4. Maximum file size — e.g. 256 KB per file (flag `Cursor Run Log` for split policy)
5. Generated-file exclusions — `analysis/*_events.jsonl`, `*.tmp`
6. Absolute-path lint — fail on `C:\` / `/Users/` outside allowed examples
7. JSON schema validation — RB-G9 receipt schemas
8. Markdown link validation — index targets exist
9. Duplicate-path detection — same session ID two authoritative homes
10. Machine-receipt hash verification — recompute `receiptSha256`
11. Authorization fingerprint verification — match index ↔ receipt
12. No temp/runtime artifacts
13. Human review checklist gate

---

## 14. `.git/index.lock` assessment and future procedure

| Field | Value |
|-------|-------|
| Appears stale | **Ambiguous** — 0-byte file from **2026-07-06**, but **active `git` process** observed **2026-07-11** |
| Likely cause | Prior interrupted Git op left empty lock; IDE Git still running |
| Action this gate | **Untouched** |

### Future authorized procedure

1. Verify no active `git` process (or stop IDE Git integration safely)
2. Close Git-using tools if needed
3. Record lock metadata (size, mtime, pid snapshot)
4. Remove lock manually **only** under implementation authorization
5. Run read-only `git status` integrity check
6. Stop if lock reappears immediately — investigate hung process
7. **No commit** until pre-commit screening passes

---

## 15. Baseline migration plan (planning only)

### Phase 1 — freeze and inventory
- Freeze canonical tree inventory (this gate)
- Secret scan gate
- Classify include/exclude
- Generate baseline SHA-256 manifest

### Phase 2 — prepare rules
- Author `.gitignore` / allowlist amendments
- Stage dry-run review
- Inspect diff for paths/secrets
- Verify receipt hashes match index

### Phase 3 — baseline commit
- Human approval after screening
- Single baseline commit + tag `governance-baseline-2026-07-11`
- Off-machine encrypted backup
- Vault summary bridge stub

### Phase 4 — ongoing
- Append-only workflow for new gates
- Periodic manifest refresh
- Incident response: restore from tag + manifest

---

## 16. Rollback strategy

| Scenario | Response |
|----------|----------|
| Bad baseline commit | `git revert` — no history rewrite |
| Partial stage failure | `git reset` (mixed) before commit only under authorization |
| Path move regret | **Forbidden in first commit** — no moves |
| Manifest mismatch | Restore from off-machine checkpoint |
| Lock recurrence | Abort commit; process investigation |
| Receipt hash drift | Block commit; reconcile index |

**Principle:** no deletion, no path moves in first baseline.

---

## 17. AP04 governance-integrity entry criteria

Before AP04 authorization:

1. Canonical ownership model **approved** *(this plan)*
2. Sensitive-data screening **passed**
3. Baseline integrity mechanism **implemented** (Git + manifest)
4. Canonical records **versioned or checkpointed**
5. AP01/AP02/AP03 evidence **preserved** in Git or manifest
6. Machine receipts **hash-verified**
7. No unresolved duplicate-ledger conflict (repo vs vault)
8. `.git/index.lock` **resolved under authorization**
9. Clean integrity verification receipt
10. Production posture **revalidated** (disarmed)
11. **F4 still separately pending**
12. **No AP03 authority reused**

---

## 18. Sequencing relative to F4

**Decision: B**

Governance integrity planning accepted now. F4 production-integration planning may proceed in parallel. **AP04 remains blocked until both governance integrity implementation and F4 are complete and independently reviewed.**

---

## 19. Implementation readiness

**CONDITIONALLY READY AFTER SENSITIVE-DATA REVIEW**

Rationale: Hybrid model is designed; absolute/username path hygiene and secret-value confirmation must complete before implementation authorization.

---

## 20. Recommended next gate

**RB-G9 Governance Sensitive-Data Review**

Then: **RB-G9 Governance Record Integrity Implementation Authorization**

---

**Canonical path:**  
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 Governance Record Integrity Planning — 2026-07-11.md`

Operating principle: Strength through honesty, speed through integrity.
