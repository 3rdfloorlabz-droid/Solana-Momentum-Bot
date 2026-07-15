# RB-G10 A4 Proof-Failure Review - 2026-07-14

## Scope

This record documents the RB-G10 A4 read-only RPC proof failure review authorized by Taylor.

This is an evidence review only. It does not modify `execution_audit.jsonl`, `.env`, `live_config.json`, runtime state, process state, wallet material, or any trading authority.

## Runtime Posture At Review

- Review timestamp source: runtime-health collected at `2026-07-14T18:43:28.213Z`
- Runtime classification: `HEALTHY_DRY_RUN`
- Operational posture: `PIPELINE_OBSERVING`
- `executionMode`: `PIPELINE_DRY_RUN`
- `dryRunMode`: `true`
- `liveArmed`: `false`
- `capitalExposure`: `none`
- Pending reconciliation rows: `0`
- Open live positions: `0`
- Runtime-health `supportsLiveReadiness`: `false`

## A4 Runtime-Health Summary

- A4 status: `A4_READ_ONLY_RPC_VERIFIED`
- A4 proof freshness: fresh
- A4 proof stability `successCount`: `3`
- A4 proof stability `freshSuccessCount`: `1`
- A4 proof stability `failureObserved`: `true`
- A4 proof stability `stabilityCandidate`: `false`

Runtime-health remains correct to report dry-run health while refusing live-readiness support.

## Reviewed A4 Proof Rows

Only recent `A4_READ_ONLY_RPC_PROOF` rows were inspected. The fields below are non-secret audit categories only.

| Timestamp UTC | Status | Provider Label | Endpoint Class | Method | Latency Bucket | Public Fallback | Secret Safe | Error Code | Capital Exposure |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `2026-07-13T17:13:09.605Z` | `READ_ONLY_RPC_OK` | `helius_rpc_url_configured` | `dedicated` | `getSlot` | `<250ms` | `false` | `true` | `null` | `unknown` |
| `2026-07-13T17:33:24.497Z` | `READ_ONLY_RPC_OK` | `helius_rpc_url_configured` | `dedicated` | `getSlot` | `<250ms` | `false` | `true` | `null` | `unknown` |
| `2026-07-14T18:39:34.687Z` | `READ_ONLY_RPC_FAILED` | `helius_rpc_url_configured` | `dedicated` | `getSlot` | `<250ms` | `false` | `true` | `RPC_NETWORK_ERROR` | `none` |
| `2026-07-14T18:39:53.607Z` | `READ_ONLY_RPC_OK` | `helius_rpc_url_configured` | `dedicated` | `getSlot` | `<250ms` | `false` | `true` | `null` | `none` |

## Classification

The `2026-07-14T18:39:34.687Z` failed proof row is classified as sandbox/network-environment noise, not a real dedicated-RPC provider failure.

Rationale:

- The failed row selected the same safe provider category: `helius_rpc_url_configured`.
- The failed row selected the same endpoint class: `dedicated`.
- Public fallback was `false`.
- Secret-safe was `true`.
- The error category was `RPC_NETWORK_ERROR`, not public fallback, configuration absence, malformed response, or HTTP provider rejection.
- A successful read-only proof followed `18.920` seconds later at `2026-07-14T18:39:53.607Z` with the same provider label, endpoint class, method, and secret-safe posture.
- The successful retry required only environment/tooling network access, not a configuration, authority, signer, or runtime posture change.

## Evidence Preservation

No evidence was modified.

The failed row remains in `execution_audit.jsonl`. Because runtime-health conservatively treats any observed proof failure as stability-disqualifying, A4 stability is not currently clean:

- `failureObserved`: `true`
- `stabilityCandidate`: `false`
- `supportsLiveReadiness`: `false`

This review classifies the failure for operator context only. It does not override runtime-health, rewrite audit history, or grant live authority.

## Decision Boundary

The stack is observing in healthy dry-run mode. It is not live-ready under current runtime-health evidence because A4 stability remains blocked by the preserved failed proof row.

The next safe decision is an explicit governance choice between:

- preserve the evidence as-is and wait for a fresh uninterrupted A4 stability window, or
- authorize a separate evidence-remediation path that does not rewrite history and remains auditable.
