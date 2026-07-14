# RB-G10 Evidence Preservation and Baseline Commit Planning - 2026-07-13

Status: **PLANNING COMPLETE - CONDITIONAL ON MANUAL SECRET REVIEW**

Mode: **PLANNING, INVENTORY, AND READ-ONLY VERIFICATION ONLY**

Planning start UTC: `2026-07-14T05:14:05.7471461Z`

Planning start local MDT: `2026-07-13T23:13:55.0255591-06:00`

Planning completion UTC: `2026-07-14T05:16:22.5435401Z`

Planning completion local MDT: `2026-07-13T23:16:22.5475393-06:00`

Canonical procedural review:
`Ori/Phase 2/Project Vulcan/Live Readiness/RB-G10 PROCEDURAL DEVIATION REVIEW - 2026-07-13.md`

Procedural-review machine receipt:
`analysis/rb_g10_procedural_deviation_review_receipt.json`

This planning gate does not authorize arming, trading, runtime changes, Git staging, commit, push, index-lock removal, or evidence rewriting.

## Repository Identity

| Field | Value |
|---|---|
| Repo root | `C:\TracktaOS\Projects\Active\Solana-Momentum-Bot` |
| Branch | `github-clean` |
| HEAD | `3de99c5bbbeda974ee3a39d5c362a4cbcee54d80` |
| Upstream | `origin/main` |
| Working tree summary | AP04/RB-G10 preservation candidates remain untracked; no index changes performed |
| `.git/index.lock` | Absent |
| `.git/index.lock` size | N/A |
| `.git/index.lock` mtime | N/A |

Relevant untracked files:

```text
?? Ori/Phase 2/Project Vulcan/Live Readiness/RB-G10 PROCEDURAL DEVIATION REVIEW - 2026-07-13.md
?? Ori/Phase 2/Project Vulcan/Live Readiness/Sessions/SESSION - RB-G9-20260713-AP04 - 2026-07-13/SECOND MICRO-LIVE CANDIDATE PACKET - RB-G9-20260713-AP04 - 2026-07-13.md
?? Ori/Phase 2/Project Vulcan/Live Readiness/Sessions/SESSION - RB-G9-20260713-AP04 - 2026-07-13/second_micro_live_candidate_packet.json
?? analysis/rb_g9_20260713_ap04_second_micro_live_candidate_packet_receipt.json
?? analysis/rb_g9_20260713_ap04_second_micro_live_execution_1784004595953_receipt.json
```

Relevant ignored files:

```text
!! analysis/ap04_second_micro_live_execute_once.js
!! analysis/rb_g10_procedural_deviation_review_receipt.json
```

RB-G10 receipt ignore rule:

```text
.gitignore:49:analysis/*    analysis/rb_g10_procedural_deviation_review_receipt.json
```

The rule is broad for `analysis/`, not a receipt-specific exclusion.

## Production Posture

| Field | Value |
|---|---|
| `executionMode` | `PIPELINE_DRY_RUN` |
| `dryRunMode` | `true` |
| `liveArmed` | `false` |
| Runtime stub | absent |
| Pending reconciliation rows | `0` |
| Open live positions | `0` |
| `live_positions.json` | `[]` |
| Executor/scanner process from this repo | absent in process scan |
| Live submission | blocked |
| AP04/RB-G10 authority active | no |
| OR-20260630-008 | `not_promoted` |
| Strategy readiness | `NOT READY` |

## Canonical Evidence Policy

| Evidence type | Policy |
|---|---|
| Human-readable governance records | Commit after manual secret/path review; primary audit narrative. |
| Machine JSON receipts | Commit canonical AP04/RB-G10 receipts; force-add exact ignored receipts only under explicit future authorization. |
| JSONL/event logs | Keep ignored; preserve hashes or extracted summaries only unless separately authorized. |
| One-off execution scripts | Keep ignored; preserve path/hash only; do not promote as reusable tooling. |
| Candidate packet source data | Commit Markdown and JSON after manual review. |
| Volatile runtime state | Must not commit. |
| Transaction signatures | Public chain evidence; allowed inside governance records and receipts after broadcast. |
| Reconciliation artifacts | Commit closeout/reconciliation receipts; keep volatile state files ignored. |

## Evidence Inventory

Sensitive findings are category-only. No secret values were printed.

| Path | Category | Size | SHA-256 | Status | Internal timestamp | Referenced | Local paths | Sensitive categories | Treatment |
|---|---:|---:|---|---|---|---|---|---|---|
| `ACTIVE_MANIFEST.md` | posture | 60528 | `47f6ddc711eee3e48299247dcf6135a5d2a6fe0785eaf87b9e695bf32b300b8d` | tracked-clean | `2026-06-29` | yes | no | secret-policy/signer-term | TRACK |
| `LIVE_AUTHORIZATION_RECORD.md` | posture | 7537 | `a89f50c1c434dec64227ce7ee526e4f21ebe214c73127debfaed2459dfcd9ef0` | tracked-clean | none | no | yes | signer/rpc/path/username policy terms | REVIEW MANUALLY |
| `Ori/Operations/Cursor Run Log.md` | run log | 126370 | `80ce0ee92bd6d137084cbd41405003b534bd255f315ec3c4e4ffb3c57752d7f9` | tracked-clean | `2026-07-03` | no | no | signer/rpc policy terms | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/RB-G10 PROCEDURAL DEVIATION REVIEW - 2026-07-13.md` | RB-G10 governance | 8001 | `37ceae0105baecdadca1740cac84ccc4340a396277244175e74f1fb1d2801855` | untracked | `2026-07-13` | no | yes | rpc/path policy terms | TRACK AFTER REVIEW |
| `analysis/rb_g10_procedural_deviation_review_receipt.json` | RB-G10 receipt | 2792 | `3b6ef6fdf8e3dbc36a435431179f447bef11244a73b39d0d6faf9a25c37f64ba` | ignored | `2026-07-14T05:08:44.7496486Z` | no | yes | rpc/path policy terms | FORCE-ADD EXACT RECEIPT AFTER REVIEW |
| `Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 AP04 Pre-Planning - Design Parameters and Blocking Prerequisites - 2026-07-11.md` | AP04 planning | 8189 | `fb94fa7d29cd76a4e7e5c6f8d2856d1c98d1d5aed99d66a0b91df22199d10dcc` | tracked-clean | `2026-07-11` | yes | no | none | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 AP04 Timing Remediation and Proof Retry Planning - 2026-07-11.md` | AP04 planning | 14355 | `32151753f4e43be0d8fa8e11f250cde909a6a94f78a7a9ee69075273c456545a` | tracked-clean | `2026-07-11` | yes | no | none | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/Decisions/DECISION - RB-G9 AP04 Remediation Acceptance - 2026-07-11.md` | decision | 9120 | `9bb8936b7b4bb4a99876bb00dc3e2f10e50b881249ccebccc8aa1949badc980e` | tracked-clean | `2026-07-11` | yes | no | none | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9 ARMED CONTINUUM PRODUCTION INTEGRATION AUTHORIZATION - 2026-07-13.md` | production integration | 1740 | `dced82f12c57d6c30bc5f94dfdb57194819a43e417fee9a36a156329fade6a47` | tracked-clean | `2026-07-13` | no | no | rpc policy terms | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION - RB-G9 Armed Continuum Production Integration - 2026-07-13.md` | production integration | 5503 | `29c051e12ff1e9c6739b071a82b520acc5f826deb390944b9bf7bb8df49f4699` | tracked-clean | `2026-07-13` | yes | no | signer policy terms | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9-20260713-AP04 FRESH G1-G4 GOVERNANCE AUTHORIZATION - 2026-07-13.md` | G1-G4 | 4445 | `bedc71e9691a7a361f48c3a0b6cc1c987a20966a592f7adc9c92c535e570f577` | tracked-clean | `2026-07-13` | yes | no | rpc policy terms | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION - R15 ARMED-NO-SUBMIT ONE_SESSION_ONLY - RB-G9-20260713-AP04 - 2026-07-13.md` | G1 | 5253 | `74039b884a545a074057baffdb8dee4cef435d26cdfc601c41156b3ea73857ec` | tracked-clean | `2026-07-13` | yes | no | none | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION - Arming - RB-G9-20260713-AP04 - 2026-07-13.md` | G2 | 4352 | `7b21238734d3bff7fe6add2fef86dfdbcf9730f97cc2e6b35d42e3da6e5d8613` | tracked-clean | `2026-07-13` | yes | no | none | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION - Runtime Stub Creation - RB-G9-20260713-AP04 - 2026-07-13.md` | G3 | 5797 | `9d3e8e311d20ef96d5522debe21c9617bd99a0ef2cec60c54b30f7b61f55c9ce` | tracked-clean | `2026-07-13` | yes | no | rpc policy terms | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION - Armed No-Submit Proof - RB-G9-20260713-AP04 - 2026-07-13.md` | G4 | 6303 | `e67b6ca39816bbc80d456fcc318b6037a3ebc7d7ae9151802f8e505d435ff455` | tracked-clean | `2026-07-13` | yes | no | none | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/RB-G9-20260713-AP04 PROCESS ISOLATION AUTHORIZATION - 2026-07-13.md` | process isolation | 1536 | `270c8ad18909cf41bb699e2bee0d3465421b47b8a4a67d0a95cf62f844c1aefd` | tracked-clean | `2026-07-13` | no | no | rpc policy terms | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION - Process Isolation - RB-G9-20260713-AP04 - 2026-07-13.md` | process isolation | 7134 | `dd40557cca4c1b20df438a5416da2b557755a10a872e14a47f4614b053e3b4f8` | tracked-clean | `2026-07-13` | yes | no | signer policy terms | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/FINAL FRESH DOMAIN A PROOF - RB-G9-20260713-AP04 - 2026-07-13.md` | Domain A | 8105 | `4e73febdf4e33a40b55bc54d9ffad4d9f37654d74a2516b24729782a19768cdd` | tracked-clean | `2026-07-13` | no | no | rpc policy terms | TRACK |
| `analysis/rb_g9_20260713_ap04_final_domain_a_receipt.json` | Domain A receipt | 4058 | `92ff5143620c04922c100c3f3cecaa9e0c34fc5b25685f434426e9dec296cad9` | tracked-clean | `2026-07-13T23:47:52.2089531Z` | yes | no | none | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/AP04 DOMAIN A RECAPTURE AND PROCESS ISOLATION PROOF - RB-G9-20260713-AP04 - 2026-07-13.md` | Domain A/isolation | 5393 | `209232bcfe96bb384a99399b7883e8e964ca037b7ad6d870bb8d394306fba306` | tracked-clean | `2026-07-13` | no | no | rpc policy terms | TRACK |
| `analysis/rb_g9_20260713_ap04_domain_a_recapture_and_process_isolation_receipt.json` | Domain A/isolation receipt | 3772 | `772a790b6a5d9dbfb0c4abefb39db643bce95facd35ba6e9b4153e7b0cd760bb` | tracked-clean | `2026-07-14T00:06:43.8750286Z` | yes | no | none | TRACK |
| `analysis/rb_g9_20260713_ap04_arming_baseline_manifest.json` | AP manifest | 6653 | `2fddc09a3c9e91145f52fda5fd063777b7ba20ce112487860bbfe7dcb97e9146` | tracked-clean | `2026-07-13T23:47:52.2089531Z` | yes | no | signer policy terms | TRACK |
| `analysis/rb_g9_20260713_ap04_schema_valid_retry_validate_armed_preflight_receipt.json` | armed no-submit validator | 12161 | `bdf2630c1e4b41ac919473dddd170ca69cd42b3d4dc578fd03b337ec376495c2` | tracked-clean | `2026-07-14T01:44:58.832Z` | yes | yes | signer/rpc/path/username policy terms | REVIEW MANUALLY |
| `analysis/rb_g9_20260713_ap04_schema_valid_retry_armed_preflight_manifest_receipt.json` | armed no-submit manifest | 12494 | `ca1772ce43d388ba89ce778f9600f5d5d2eebf5dd114e3d14abef1cef58efa20` | tracked-clean | `2026-07-14T01:45:22.397Z` | yes | yes | signer/rpc/path/username policy terms | REVIEW MANUALLY |
| `analysis/rb_g9_20260713_ap04_schema_valid_armed_no_submit_proof_pass_receipt.json` | armed no-submit closure | 4225 | `3466fa423fb75f14325bbdb90d5260c532a26fd88fa6483794de4a8e808eecf2` | tracked-clean | `2026-07-14T01:39:59.2417229Z` | yes | no | signer policy terms | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/AP04 SCHEMA-VALID ARMED-NO-SUBMIT PROOF PASS - RB-G9-20260713-AP04 - 2026-07-13.md` | armed no-submit proof | 1757 | `6fa4df1281f708535bf07f7a6a3fa8f72127a867a08afdb21a01739e4a2a31c9` | tracked-clean | `2026-07-13` | yes | no | none | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/AP04 MICRO-LIVE EXECUTION AUTHORIZATION GOVERNANCE GATE - RB-G9-20260713-AP04 - 2026-07-13.md` | first micro-live auth | 1674 | `31b76f94673e399cdb5d1ac40b5ba6e8135851e86d5d3114bf8a419f52d0090a` | tracked-clean | `2026-07-13` | no | no | none | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION - Micro-Live Execution - RB-G9-20260713-AP04 - 2026-07-13.md` | first micro-live auth | 10421 | `39c3ac8c1a8d672dcd153ec3a35ab11313c541059ec17f700d7a76204582d4ef` | tracked-clean | `2026-07-13` | yes | no | signer/rpc policy terms | TRACK |
| `analysis/rb_g9_20260713_ap04_micro_live_execution_authorization_governance_receipt.json` | first micro-live auth receipt | 2815 | `123e1248ea66641eef8dfd0ec8cd8ab720084743af098805d0cc27cf75469147` | tracked-clean | `2026-07-14T01:52:10.7537921Z` | yes | no | signer policy terms | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/Sessions/SESSION - RB-G9-20260713-AP04 - 2026-07-13/CANDIDATE PACKET - RB-G9-20260713-AP04 - 2026-07-13.md` | first candidate packet | 3811 | `21ea5f9685fdd5e7c29eec61603055d95880c757e8eea1c43256c19ea4b0bce4` | tracked-clean | `2026-07-13` | yes | no | rpc policy terms | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/Sessions/SESSION - RB-G9-20260713-AP04 - 2026-07-13/candidate_packet.json` | first candidate packet | 9391 | `f188aaad4557f2f1049faf38e1924ac1995ab8fbd76e1a440c20ec1c9d309e9b` | tracked-clean | `2026-07-14` | yes | no | rpc policy terms | TRACK |
| `analysis/rb_g9_20260713_ap04_first_live_execution_1784001899237_receipt.json` | first BUY receipt | 1998 | `06200889025e58e778d7981b296043bd2075a559fdb39dd0edf8461e2c6b3823` | tracked-clean | `2026-07-14T04:04:59.237Z` | yes | no | none | TRACK |
| `analysis/rb_g9_20260713_ap04_mandatory_exit_only_1784001994477_receipt.json` | first mandatory SELL receipt | 1054 | `ea1f4c4400f1def6a61312040324180f5fdb445edf41ab6ac6a5c7f1d6016045` | tracked-clean | `2026-07-14T04:06:34.477Z` | yes | no | rpc policy terms | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/AP04 FIRST-LIVE EXECUTION CLOSEOUT - RB-G9-20260713-AP04 - 2026-07-13.md` | first closeout | 3589 | `cc14c8f37d506219822214cfcb9334ea9abed74453b06200e1c6206bdff5be76` | tracked-clean | `2026-07-13` | yes | no | rpc policy terms | TRACK |
| `analysis/rb_g9_20260713_ap04_first_live_closeout_receipt.json` | first closeout receipt | 2072 | `6f088e9a96d352f522c5ba13dfd408a2f459886713131fe211bbcb99f9bf3c00` | tracked-clean | `2026-07-14T04:25:14.7585908Z` | yes | no | rpc policy terms | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/AP04 SECOND MICRO-LIVE EXECUTION AUTHORIZATION GOVERNANCE GATE - RB-G9-20260713-AP04 - 2026-07-13.md` | second micro-live auth | 2422 | `53fa2945b51cf722406277745e47f08248b2785e80bf09cc40679f64701eb34e` | tracked-clean | `2026-07-13` | no | no | rpc policy terms | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/Authorizations/AUTHORIZATION - Second Micro-Live Execution - RB-G9-20260713-AP04 - 2026-07-13.md` | second micro-live auth | 10376 | `1589abc14077112308a5360eead03a026e5c81078db51d2ea0d4c76e135fd457` | tracked-clean | `2026-07-13` | yes | no | rpc policy terms | TRACK |
| `analysis/rb_g9_20260713_ap04_second_micro_live_execution_authorization_governance_receipt.json` | second auth receipt | 1537 | `9a7e2feffb0c5cb9a1b2add5c452eb71723f8a0751d6caf0584f1e73d49052a3` | tracked-clean | `2026-07-14T04:25:14.7585908Z` | yes | no | none | TRACK |
| `Ori/Phase 2/Project Vulcan/Live Readiness/Sessions/SESSION - RB-G9-20260713-AP04 - 2026-07-13/SECOND MICRO-LIVE CANDIDATE PACKET - RB-G9-20260713-AP04 - 2026-07-13.md` | second candidate packet | 5076 | `b38662540790047a75a0ce5e1c45251d67132bc681f34e09c5183889d7a09ea2` | untracked | `2026-07-13` | yes | no | signer/rpc policy terms | TRACK AFTER REVIEW |
| `Ori/Phase 2/Project Vulcan/Live Readiness/Sessions/SESSION - RB-G9-20260713-AP04 - 2026-07-13/second_micro_live_candidate_packet.json` | second candidate packet | 7943 | `099a25f324806cb288a5d30adf89846fb2948c9f92917045093691a3139c7872` | untracked | `2026-07-14` | yes | no | rpc policy terms | TRACK AFTER REVIEW |
| `analysis/rb_g9_20260713_ap04_second_micro_live_candidate_packet_receipt.json` | second candidate receipt | 2877 | `ac8e4d353ffe24353d258e63322ce21df995f4e5406cb040b14fb9912a660583` | untracked | `2026-07-14T04:40:53.284Z` | yes | no | rpc policy terms | TRACK AFTER REVIEW |
| `analysis/ap04_second_micro_live_execute_once.js` | one-off execution script | 14068 | `02725806f1acac762042a14063f701c69371154fa8890524692fe9e40a623ae6` | ignored | `2026-07-14T05:30:00.000Z` | yes | no | rpc policy terms | KEEP IGNORED / HASH ONLY |
| `analysis/rb_g9_20260713_ap04_second_micro_live_execution_1784004595953_receipt.json` | second execution receipt | 7233 | `296425ccf36261ff280bcfac6de280ebab3ba53a14f3a5621db970571cce75a5` | untracked | `2026-07-14T04:49:55.953Z` | yes | no | rpc policy terms | TRACK AFTER REVIEW |
| `live_trades.json`, `live_trades.jsonl`, `live_errors.jsonl`, `execution_audit.jsonl`, `live_control_events.jsonl`, `pending_reconciliation.jsonl`, `live_positions.json`, `panic_events.jsonl` | volatile runtime/log state | mixed | hashes captured during planning | ignored | mixed | yes | mixed | runtime/log/path/payload risk | MUST NOT COMMIT |
| `live_config.json` | active config posture | 2175 | `0996882e1a5244d05079a2a6f3ff09049758ecbbf3b8e3e0434ee4b13a4d33ef` | tracked-clean | `2026-06-14T03:54:17.268Z` | yes | no | rpc policy terms | DO NOT TOUCH IN PRESERVATION COMMIT |

## Preservation Sets

SET 1 - MUST COMMIT after manual sensitive-data review:

- This planning record.
- `Ori/Phase 2/Project Vulcan/Live Readiness/RB-G10 PROCEDURAL DEVIATION REVIEW - 2026-07-13.md`.
- Second micro-live candidate packet Markdown and JSON.
- `analysis/rb_g9_20260713_ap04_second_micro_live_candidate_packet_receipt.json`.
- `analysis/rb_g9_20260713_ap04_second_micro_live_execution_1784004595953_receipt.json`.
- One appended row in `Ori/Operations/Cursor Run Log.md`.
- Existing tracked AP04 proof, G1-G4, production-integration, first micro-live, second authorization, and closeout artifacts remain part of the verified baseline.

SET 2 - COMMIT ONLY IF EXPLICITLY FORCE-AUTHORIZED:

- `analysis/rb_g10_procedural_deviation_review_receipt.json` - **FORCE-ADD EXACT RECEIPT**.
- Any later ignored AP04/RB-G10 machine receipt, only if named exactly.

SET 3 - MUST NOT COMMIT:

- `.env`, wallet material, signer secrets, runtime stubs.
- `analysis/ap04_second_micro_live_execute_once.js` unless a separate audit-tooling authorization changes its treatment.
- Runtime JSONL/log/state files: `live_trades*`, `live_errors.jsonl`, `execution_audit.jsonl`, `live_control_events.jsonl`, `pending_reconciliation.jsonl`, `live_positions.json`, `panic_events.jsonl`.
- `executor_singleton.lock.json`, `node_modules/`, zip snapshots, process dumps, environment dumps.
- `live_config.json` in this preservation lane.

## Ignored RB-G10 Receipt Decision

Recommendation: **FORCE-ADD EXACT RECEIPT**

| Question | Answer |
|---|---|
| Exact ignore rule | `.gitignore:49:analysis/*` |
| Broad or intentional | Broad; not receipt-specific |
| Force-add appropriate | Yes, this exact file only, after manual secret/path review |
| Change `.gitignore` instead | Riskier now; a future narrow allowlist can be considered separately |
| Secrets found | No values confirmed or printed; category scan found rpc/path terms |
| Volatile state | No live position or mutable runtime queue state |
| Machine-local paths | Yes, repo-root metadata |
| Hash-only manifest sufficient | No; useful supplement but not enough for a canonical machine receipt |
| Off-machine preservation | Required even if committed |

## One-Off Execution Script Decision

Path: `analysis/ap04_second_micro_live_execute_once.js`

Classification: **temporary one-off script; useful audit support; not reusable operator tooling**

Recommendation: **keep ignored; preserve hash only; archive outside active runtime only under separate authorization; delete later only under separate authorization**

## Sensitive-Data Screening Checklist

Before any staging: private keys; seed phrases; signer secrets; RPC credentials; API tokens; secret-bearing URLs; full wallet material; personal information; machine usernames; absolute paths; command-line captures; environment dumps; large base64/binary payloads; runtime stubs; reusable authority.

Findings by category and path only:

- Absolute local paths: `LIVE_AUTHORIZATION_RECORD.md`, RB-G10 procedural review, RB-G10 receipt, AP04 validator/manifest receipts, `live_errors.jsonl`.
- Machine username: `LIVE_AUTHORIZATION_RECORD.md`, AP04 validator/manifest receipts.
- Secret/signer policy terms: governance docs and receipts discussing signer boundaries.
- Credential/RPC policy terms: governance docs and receipts discussing RPC boundaries.
- Large payload/log risk: `execution_audit.jsonl`.

## Baseline Hash Manifest Design

Recommended path:
`Ori/governance/manifests/rb_g10_ap04_baseline_20260714T0516Z.jsonl`

Schema per line:

```json
{
  "schemaVersion": "rb-g10-baseline-manifest/v1",
  "generatedAtUtc": "2026-07-14T05:16:22.5435401Z",
  "generatorVersion": "manual-plan-v1",
  "previousManifestSha256": null,
  "path": "relative/repo/path",
  "evidenceCategory": "governance|machine-receipt|candidate-packet|runtime-excluded|hash-only",
  "sizeBytes": 0,
  "sha256": "hex",
  "internalTimestamp": "ISO or null",
  "gitStatusAtGeneration": "tracked-clean|untracked|ignored",
  "recommendedTreatment": "TRACK|FORCE-ADD|KEEP IGNORED|MUST NOT COMMIT",
  "containsSecretContents": false,
  "attestation": "No secret contents are included in this manifest; hashes and paths only."
}
```

The manifest itself should be committed after manual sensitive-data review.

## Commit Structure

Option A - one baseline evidence commit:
simple, but mixes governance, candidate packets, machine receipts, and force-add exceptions.

Option B - multiple scoped commits:
fine-grained, but too much ceremony for this small AP04/RB-G10 delta.

Option C - one governance commit plus one machine-evidence commit:
separates human records from machine receipts and force-add exceptions while staying fast.

Recommendation: **Option C - one governance commit plus one machine-evidence commit**

Proposed order and messages:

1. Governance/candidate commit:
   - RB-G10 procedural review Markdown.
   - RB-G10 planning Markdown.
   - second micro-live candidate packet Markdown and JSON.
   - Cursor Run Log row.
   - Message: `Preserve RB-G10 governance and second micro-live packet`
2. Machine-evidence commit:
   - second micro-live candidate packet receipt.
   - second micro-live execution receipt.
   - RB-G10 procedural-review receipt if explicitly force-authorized.
   - baseline hash manifest.
   - Message: `Preserve AP04 micro-live machine evidence baseline`

Tags are not needed before independent review. A future tag can be added after verification, for example `rb-g10-ap04-evidence-baseline-20260714`.

Rollback uses `git revert` only; no history rewrite. Unrelated dirty-tree changes stay excluded by staging exact allowlisted paths only.

## Push Sequencing

Decision: **COMMIT FIRST; INDEPENDENT REVIEW; PUSH IN SEPARATE GATE**

## Safe Future Staging Procedure

1. Verify no active Git process owns the repo.
2. If `.git/index.lock` exists, stop and use the lock procedure below.
3. Rerun secret/path scan over SET 1 and SET 2 only.
4. Generate baseline manifest.
5. Stage exact allowlisted paths only.
6. Force-add only exact paths named by Taylor.
7. Inspect `git diff --cached --name-status`.
8. Inspect `git diff --cached` for human-readable files.
9. Verify staged hashes.
10. Confirm no `.env`, runtime stub, JSONL runtime log, zip, `node_modules`, or unrelated file is staged.
11. Taylor approves staged set and message.
12. Commit locally.
13. Perform post-commit verification.
14. Push only under separate authority.

## `.git/index.lock` Future Procedure

1. Verify no Git process, IDE operation, or background tool owns it.
2. Close Git-integrated tools if required.
3. Record lock metadata: presence, path, size, UTC/local mtime.
4. Remove only the exact stale lock, and only under explicit authorization.
5. Run `git status` and `git fsck` or equivalent safe checks.
6. Stop if the lock reappears.
7. Proceed only after screening and approval.

Current checkpoint: `.git/index.lock` absent.

## Evidence-Acceptance Criteria

- All canonical AP04 and micro-live artifacts inventoried.
- All canonical hashes independently verified.
- Both transaction pairs reconciled.
- First-trade procedural deviation preserved.
- Second-trade authority preserved.
- No reusable authority active.
- Current disarmed/flat posture documented.
- No secrets in preservation set.
- Force-add decision approved.
- Baseline manifest generated.
- Staged diff exact and clean.
- Commit identity and message approved.
- No third live attempt before acceptance.

## Live-Attempt Blockers

- Evidence preservation incomplete.
- Procedural-deviation acceptance not final.
- Uncommitted canonical evidence remains.
- Governance baseline not independently reviewed.
- Any reusable authority found.
- Current posture not revalidated.
- RB-G10 naming/governance chain not normalized enough for audit.
- Strategy remains `NOT READY`.
- OR-20260630-008 remains `not_promoted`.
- Sensitive-data review not passed.

## Planning Result

**CONDITIONALLY READY AFTER MANUAL SECRET REVIEW**

Recommended next gate:
**RB-G10 Evidence Sensitive-Data Review**

Files modified by this planning gate:

- `Ori/Phase 2/Project Vulcan/Live Readiness/RB-G10 Evidence Preservation and Baseline Commit Planning - 2026-07-13.md`
- `Ori/Operations/Cursor Run Log.md`

Operating principle: Strength through honesty, speed through integrity.
