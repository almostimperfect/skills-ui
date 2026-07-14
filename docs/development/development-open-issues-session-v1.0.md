# Development Open-Issues Session v1.0

**Date:** 2026-07-13

## Branch decision

`development` is the daily integration branch. The work was rebuilt from `origin/development`
instead of merging the older main-based implementation branch. The replacement branch is
`development-open-issues-resolution` and is intended to merge into `development` first.

## Implemented

- Added a reproducible Docker unit-test baseline and a Docker Playwright acceptance suite.
- Enforced existing absolute directories for CLI project registration.
- Added a safe 503 fallback when the built Web entry point is absent.
- Added typed API errors with server-message extraction.
- Added confirmations and visible errors for destructive and mutation actions.
- Added keyboard-complete Add Asset and Add Project forms.
- Added typed not-found rendering, agent-toggle feedback, and partial bulk-operation results.

## Validation snapshot

- 69 unit/integration tests passed.
- TypeScript and Vite production builds passed.
- 8 Docker Playwright browser acceptance tests passed.
- Changed-file privacy scan found no real host user path or common secret marker.

## Integration sequence

1. Push the replacement branch.
2. Open and merge a pull request into `development` after checks.
3. Close the paused main-based pull request as superseded.
4. Open a protected `development` to `main` pull request for review.
