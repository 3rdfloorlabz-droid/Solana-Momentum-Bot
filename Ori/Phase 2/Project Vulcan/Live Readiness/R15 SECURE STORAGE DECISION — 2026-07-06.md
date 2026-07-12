# R15 Secure Storage Decision — 2026-07-06

Status:
**Decision complete — canonical secure storage location and rules defined for signed governance/authorization records; no arming, execution, or capital action**

Gate type:
Governance / documentation decision — secure storage policy only

Prerequisites:
`REAL RPC NO-BROADCAST READINESS CHECK — 2026-07-06.md` · `R13 SIGN-OFF GATE — 2026-07-06.md` · `ARMING AUTHORIZATION PREPARATION REVIEW — 2026-07-06.md` · `LIVE SUBMISSION PATH READINESS REVIEW — 2026-07-06.md` · `MICRO-LIVE RUNBOOK CONSOLIDATION — 2026-07-05.md` · `RUNBOOK DOCUMENTATION UPDATE — 2026-07-06.md` · `ACTIVE_MANIFEST.md`

Decision authority:
**Taylor Cheaney** (storage policy adopted for TracktaOS/Ori Live Readiness track)

Live readiness achieved:
**No**

Human soak readiness:
**Not authorized**

Strategy readiness:
**NOT READY**

OR-20260630-008:
**not_promoted** (unchanged)

**Code changed:** **No** · **Config changed:** **No** · **`.env` changed:** **No** · **Secret inspected:** **No** · **Secret printed/logged:** **No** · **process.env dumped:** **No** · **Runtime processes started:** **No** · **Real RPC broadcast used:** **No** · **Arming authorized:** **No** · **`liveArmed` true set:** **No** · **`FOMO_ENABLE_LIVE_SUBMISSION` set:** **No** · **Micro-live execution authorized:** **No** · **Capital exposure enabled:** **No**

---

## 1. Files Inspected (read-only)

| File | Purpose |
|------|---------|
| `REAL RPC NO-BROADCAST READINESS CHECK — 2026-07-06.md` | Prior gate; recommended this decision |
| `R13 SIGN-OFF GATE — 2026-07-06.md` | Existing signed R13 record; `ONE_SESSION_ONLY` framing |
| `ARMING AUTHORIZATION PREPARATION REVIEW — 2026-07-06.md` | R15 blocker; draft arming record boundaries |
| `LIVE SUBMISSION PATH READINESS REVIEW — 2026-07-06.md` | R15/RB-G9 gaps; linkage prerequisites |
| `MICRO-LIVE RUNBOOK CONSOLIDATION — 2026-07-05.md` | §4.1 storage placeholder; RB-G9 template |
| `RUNBOOK DOCUMENTATION UPDATE — 2026-07-06.md` | Gate separation; RB-G9/R15 pointers |
| `ACTIVE_MANIFEST.md` | `analysis/r15_manual_approval_record.json` gitignored stub; R15 helper |
| `docs/R15_MANUAL_APPROVAL_RECORD_AND_SESSION_RUNBOOK.md` | June template; superseded by Ori runbook for values |
| `Live Readiness/` folder structure | Existing gate receipts vs authorization records |

---

## 2. Decision Summary

| Item | Decision |
|------|----------|
| **Canonical signed-authorization storage** | `Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/` |
| **Authorizations folder created** | **Yes** — index only (`Authorizations/README.md`); no records moved |
| **Existing R13 sign-off handling** | **Link/reference only** — canonical record remains at `R13 SIGN-OFF GATE — 2026-07-06.md`; indexed from `Authorizations/README.md` |
| **Runtime machine-readable stub** | `analysis/r15_manual_approval_record.json` *(gitignored)* — **non-canonical**; may mirror signed Ori record when required by executor; never sole source of truth |
| **Operator credential storage** | Unchanged — `operator_records/` for gitignored RPC/caps configs; **not** for signed human authorization markdown |
| **Gate receipts vs signed authorizations** | Gate **receipts/planning/reviews** stay in `Live Readiness/` root; **signed authorization records** live under `Authorizations/` *(or linked gate receipt when signed inline, as with R13)* |

---

## 3. Canonical Storage Location

### 3.1 Primary — Ori Authorizations (human-signed, secret-free, git-tracked)

```
Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/
```

**Stores:**

| Record type | Filename pattern (future) | Current status |
|-------------|---------------------------|----------------|
| R13 engineering-validation waiver | Linked from index — signed inline in gate receipt | **SIGNED** — see link below |
| R15 session authorization | `AUTHORIZATION — R15 Micro-Live Session — YYYY-MM-DD.md` | Not yet signed |
| Arming authorization | `AUTHORIZATION — Arming — YYYY-MM-DD.md` | Not authorized |
| Micro-live execution authorization | `AUTHORIZATION — Micro-Live Execution — YYYY-MM-DD.md` | Not authorized |
| Post-trade review (governance copy) | `REVIEW — Post-Trade — YYYY-MM-DD.md` or RB-G9 path *(see RB-G9 decision)* | Not performed |

**R13 canonical link (not moved):**

`Ori/Phase 2/Project Vulcan/Live Readiness/R13 SIGN-OFF GATE — 2026-07-06.md` — §4 Signed Record

### 3.2 Secondary — Runtime stub (machine-readable, gitignored)

| Path | Role |
|------|------|
| `analysis/r15_manual_approval_record.json` | Executor / `r15_manual_approval_check.js` fail-closed stub input |
| `analysis/r15_manual_approval_status.json` | Read-only status output |

**Rule:** When a future gate requires on-disk R15 approval for submit, the gitignored JSON stub must include an `approvalId` and/or `oriAuthorizationPath` field pointing to the signed Ori markdown record. The Ori markdown record remains authoritative.

### 3.3 Explicitly excluded from Authorizations/

| Content | Where it belongs |
|---------|------------------|
| Private keys / seed phrases | Never stored in repo — `.env` local only |
| RPC URLs with credentials | `operator_records/local_rpc_config.json` or `.env` — gitignored |
| Raw env dumps | Forbidden everywhere |
| Screenshots with secrets | Forbidden |
| Production audit tails with sensitive payloads | `execution_audit.jsonl` / runtime root — separate durability rules (A1/RB-G9) |

---

## 4. Required Metadata — Every Signed Authorization Record

Each signed authorization markdown file **must** include these sections (headings or equivalent table):

| # | Field | Requirement |
|---|-------|-------------|
| 1 | **Title** | Human-readable record name + gate |
| 2 | **Gate name** | Exact TracktaOS/Ori gate (e.g. `R13 Sign-Off Gate`) |
| 3 | **Signer** | Full name — **Taylor Cheaney** for operator decisions |
| 4 | **Date** | ISO date of signature (`YYYY-MM-DD`) |
| 5 | **Scope** | What this record **does** authorize (bounded list) |
| 6 | **Explicit non-authorizations** | What this record **does not** authorize |
| 7 | **Risk acknowledgements** | Required R13/R14/R7b acks as applicable |
| 8 | **Expiration / session rule** | `ONE_SESSION_ONLY` · expiry date · or “valid until superseded” |
| 9 | **Linked evidence receipts** | Relative paths to prerequisite gate receipts |
| 10 | **OR status** | `OR-20260630-008: not_promoted` unless separate OR gate |
| 11 | **Live readiness claim status** | Must state **No** unless separate Live Readiness Claim gate |
| 12 | **Capital exposure status** | `none` until separate execution gate explicitly enables bounded exposure |

**Optional but recommended:** `approvalId` (unique slug), `recordType`, `supersedes`, `invocationContext`.

---

## 5. R15 `ONE_SESSION_ONLY` Storage Rule

Applies to **R15 session authorization** and inherits from the signed **R13 engineering-validation waiver** frame.

| Rule | Requirement |
|------|-------------|
| **Scope** | First engineering-validation micro-live session only |
| **Max trades** | **1** trade in first session unless a **new signed record** explicitly authorizes more |
| **Not reusable for scaling** | Record does **not** authorize second session, larger size, or additional trades without new sign-off |
| **Expiry triggers** | Expires after: (a) one completed session, (b) any ambiguity halt, (c) e-stop activation, (d) reconciliation uncertainty, (e) posture drift, (f) session loss/drawdown stop, (g) operator abort |
| **Post-trade requirement** | After any executed trade, **Post-Trade Review** (RB-G9 minimum) required before any reauthorization |
| **Reauthorization** | New signed `AUTHORIZATION — R15 Micro-Live Session — YYYY-MM-DD.md` + updated runtime stub if executor checks apply |
| **Supersession** | New record must reference prior record path and state why superseded |

**Storage:** Signed R15 session record lives under `Authorizations/` with `recordType: ONE_SESSION_ONLY` in metadata. Runtime stub must reflect the same status string (`APPROVED FOR ONE MICRO-LIVE SESSION ONLY` per `r15_manual_approval_check.js`).

---

## 6. Secret-Free Storage Requirements

| Allowed | Forbidden |
|---------|-----------|
| Public wallet address (base58) | Private keys · seed phrases · `SOLANA_SIGNER_SECRET` |
| Transaction signature *(after future broadcast only)* | Raw `.env` values |
| Redacted RPC labels (`helius_rpc_url_configured`) | Full RPC URLs with API keys |
| Boolean env presence (`signerPresent: true`) | `process.env` dumps |
| Lamport/SOL balance observations | Screenshots containing secrets |
| Gate receipt relative paths | Credentials in commit messages or run logs |

**Audit durability:** Authorization markdown is version-controlled in Ori. Edits after signature require a **new signed record** or an explicit errata gate — never silent rewrite of signed attestation text.

---

## 7. Linkage Requirements

Every **future** signed authorization record must link (relative paths) to applicable prerequisites:

| Prerequisite | Path |
|--------------|------|
| R13 sign-off | `../R13 SIGN-OFF GATE — 2026-07-06.md` |
| Live submission path readiness | `../LIVE SUBMISSION PATH READINESS REVIEW — 2026-07-06.md` |
| Signer placement execution | `../SIGNER SECRET PLACEMENT EXECUTION — 2026-07-06.md` |
| Real RPC no-broadcast check | `../REAL RPC NO-BROADCAST READINESS CHECK — 2026-07-06.md` |
| Arming preparation *(if arming gate)* | `../ARMING AUTHORIZATION PREPARATION REVIEW — 2026-07-06.md` |
| Arming authorization *(if execution gate)* | `Authorizations/AUTHORIZATION — Arming — YYYY-MM-DD.md` *(future)* |
| RB-G9 post-trade record *(after trade)* | RB-G9 structured path *(TBD — next decision gate)* |
| Post-trade review *(after trade)* | `Authorizations/REVIEW — Post-Trade — YYYY-MM-DD.md` *(future)* |

**Minimum link set by gate type:**

| Future gate | Minimum links |
|-------------|---------------|
| **Arming Authorization** | R13 · Live Submission Path · Signer Placement · Real RPC no-broadcast · Arming Preparation |
| **Micro-Live Execution Authorization** | All arming links + Arming Authorization record |
| **Micro-Live Execution receipt** | All above + Micro-Live Execution Authorization |
| **Post-Trade Review** | Execution receipt + RB-G9 structured record |

---

## 8. Cursor Run Log Reference Rule

| Rule | Detail |
|------|--------|
| **One row per gate** | Each completed gate appends exactly one row |
| **Link signed record** | When a gate produces or references a signed authorization, the row **Outcomes** column includes the relative path under `Live Readiness/` or `Authorizations/` |
| **No secrets** | Never paste env values, keys, RPC URLs, or signer material |
| **No raw env** | Use booleans/labels only (`signer present`, `dedicated RPC PASS`) |
| **Signed vs unsigned** | Mark `Taylor signed …` only when human sign-off occurred in that gate |
| **OR posture** | Every row states `OR-20260630-008 not_promoted` unless an OR Promotion gate explicitly changes it |

**Example (future arming gate row fragment):**  
`… signed AUTHORIZATION — Arming — YYYY-MM-DD.md; OR-20260630-008 not_promoted; …`

---

## 9. Existing R13 Record Handling

| Option | Decision |
|--------|----------|
| Move R13 sign-off to `Authorizations/` | **No** — preserves gate-receipt provenance chain |
| Copy duplicate signed text | **No** — single source of truth |
| Index + link from `Authorizations/README.md` | **Yes** — adopted |
| Update runbook §4.1 placeholder | **Deferred** — optional pointer edit in future runbook gate; this decision supersedes placeholder text |

The R13 signed record in `R13 SIGN-OFF GATE — 2026-07-06.md` §4 is the **authoritative R13/R15 engineering-validation waiver** until superseded by a new signed record.

---

## 10. Remaining Blockers (After This Decision)

| Blocker | Status |
|---------|--------|
| RB-G9 structured storage | **TBD** — next recommended gate |
| Real transaction broadcast | **Unproven** — by design until execution gate |
| Production-root proofs | **Deferred** |
| Final pre-arming guard transition plan | **Open** |
| Safety suite re-run before arming | **Open** |
| Arming Authorization Gate | **Not authorized** |
| Micro-Live Execution Authorization | **Not authorized** |
| R15 session authorization signed on disk | **Not yet** — storage path now defined; record not created |
| Strategy readiness (LR-02/R7b · LR-03) | **NOT READY** |
| G3 manual override ack surface | **Disabled** — must stay disabled |

**Closed by this gate:** R15 secure storage location and metadata/linkage/secret-free rules.

---

## 11. Explicit Non-Authorizations (This Gate)

| Item | Status |
|------|--------|
| Arming / `liveArmed true` | **No** |
| `FOMO_ENABLE_LIVE_SUBMISSION=YES` | **No** |
| Micro-live execution | **No** |
| Capital exposure | **No** |
| New R15 session authorization signed | **No** — policy only |
| OR promotion | **No** |
| Live / soak / strategy readiness claims | **No** |
| Code / config / `.env` modified | **No** |

---

## 12. Recommended Next Gate

**RB-G9 Structured Storage Decision**

---

## 13. Safety Confirmation

| Item | Value |
|------|-------|
| `SOLANA_SIGNER_SECRET` printed/logged | **No** |
| `.env` opened for editing | **No** |
| `executionMode LIVE` set | **No** |
| `dryRunMode false` set | **No** |
| `liveArmed true` set | **No** |
| `FOMO_ALLOW_LOOP_LIVE=YES` set | **No** |
| `FOMO_ENABLE_LIVE_SUBMISSION` set | **No** |
| Runtime loops started | **No** |
| Real RPC broadcast used | **No** |

---

Receipt path:
`Ori/Phase 2/Project Vulcan/Live Readiness/R15 SECURE STORAGE DECISION — 2026-07-06.md`

Index path:
`Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/README.md`
