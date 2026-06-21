# Lessons Learned

## Wins

- The project has a clean separation between scanner, paper monitor, pipeline dry run, and guarded live execution.
- `PIPELINE_DRY_RUN` gives a useful observation lane without signing or submitting transactions.
- The dashboard and audit files make behavior reviewable after the fact.
- Safety checks are explicit enough to document and migrate into TracktaOS.

## Candidate Handoff Improvements

- Scanner output now has a clearer handoff path through `pipeline_candidates.jsonl`.
- `candidateIntentId` gives each scanner-to-pipeline candidate a durable identity.
- Queue candidates can be preferred over duplicate open-paper candidates for the same address/pair.
- Audit seeding keeps dedupe restart-safe.

## Cooldown Logic

- Permanent pair-level blocking was too blunt.
- Intent-level dedupe is better for modern candidates.
- Address/pair fallback remains necessary for old audit rows that do not have `candidateIntentId`.
- A 60-minute same-pair cooldown balances duplicate suppression with future observation.

## Mistakes

- Duplicate observations can happen when identity rules are too loose.
- Permanent dedupe can hide legitimate future candidates.
- Runtime JSON/JSONL data can blur into source unless migration docs call it out clearly.
- Empty folders are invisible to Git unless placeholders are added.

## Duplicate Observations

Duplicate observation risk comes from:

- the same token appearing in both paper trades and pipeline candidates
- scanner restarts
- old audit rows without intent IDs
- pair identity and intent identity being mixed without clear priority

The current principle is:

1. prefer intent identity
2. fallback to pair identity for legacy rows
3. apply a pair cooldown to avoid short-window repeats

## Timeout Exits

Timeout exits keep the strategy from holding stale momentum setups indefinitely.

The paper monitor currently exits after 20 minutes if target or stop has not fired. This supports the idea that the strategy is looking for short-lived momentum, not long-term conviction.

## Principles

### Protect Capital First

Safety gates, dry-run defaults, signer guards, and explicit live arming are not friction. They are the core product boundary.

### Prefer Simplicity

Small scripts, local state files, and explicit commands make the bot understandable. TracktaOS should improve coordination without hiding critical behavior.

### Observation Before Optimization

Collect clean observations before tuning. Quote quality, route behavior, slippage, timeouts, and duplicate patterns should be measured before strategy complexity increases.
