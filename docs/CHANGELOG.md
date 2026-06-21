# Changelog

## 2026-06-21: TracktaOS Migration Documentation

Major changes:

- Added migration-focused project documentation.
- Added architecture, operations, strategy, roadmap, ideas, and lessons-learned docs.
- Added test folder structure for future handoff, monitor, and scanner coverage.
- Expanded `.env.example` with blank placeholders for referenced environment variables.
- Documented live-trading safety boundaries and dry-run defaults.

Why it happened:

- The existing Solana Momentum Bot is being prepared for TracktaOS.
- Future work needs a clear map of what the bot does, how to operate it, and where safety boundaries live.
- Runtime data, source code, and live execution controls need to be easier to reason about during migration.

## 2026-06-20: Pipeline Observation Dedupe Policy

Major changes:

- Observation dedupe now prefers `candidateIntentId`.
- Legacy address/pair dedupe remains for older audit rows without intent IDs.
- Same address/pair observations now use a 60-minute cooldown instead of being blocked forever.
- Candidate selection audit visibility now includes queue/read and skip counters.

Why it happened:

- The old address/pair dedupe could permanently suppress later observations of the same pair.
- The pipeline needed restart-safe dedupe while still allowing fresh candidate intents after a cooldown.

## Future Notes

Future you will love this: keep recording not just what changed, but why the change existed in the first place. The "why" is the part that saves the next migration.
