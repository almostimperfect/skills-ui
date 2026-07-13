# Open Issues Resolution Design v1.0

**Date:** 2026-07-13

**Status:** Proposed for implementation

**Baseline:** `0346b50` (`codex/docker-e2e-baseline`)

## Goal

Resolve all 15 open or scheduled entries in `.DEVELOPMENT/ISSUES.md`, convert their executable
expectations into passing regressions, update the living documentation, and publish the verified work
without exposing workstation-specific paths or secrets.

## Scope

The implementation covers:

- `PERF-001`
- `DEBT-001`, `DEBT-002`, and `DEBT-004`
- `UX-001` through `UX-011`

`DEBT-003` and `BUG-001` are already resolved in the baseline. Their stale descriptions in E2E and
testing documentation will be corrected, but their working implementation will not be redesigned.

## Architecture

### Core state and validation

The state manager will expose a single-read disabled-state query so API matrix builders can load a
project's state once and calculate skill/agent status in memory. Enable operations will reject missing
canonical skills before writing state or creating symlinks.

CLI and API enable/disable flows will share the same validation rules: the project must be registered,
the requested agent must be supported and assigned to that project, and the skill must exist when it is
being enabled. Validation failures must not mutate `state.json` or the filesystem.

Project registration through the CLI will match the API contract: the input must already be an
absolute path and must identify an existing directory. Relative and nonexistent paths produce a clear
nonzero result and never enter the project registry.

Skill removal will check installed-store truth before calling the bundled `skills` binary, so a missing
skill produces a clear nonzero CLI result and an API not-found response.

### API and server behavior

Unknown skill detail requests will return `404` rather than placeholder metadata. Dead metadata
fallback code will be removed. A server started without a Web build will return an actionable response
that instructs the operator to run the build command instead of surfacing a `sendFile` failure.

Error bodies will retain the existing `{ error: string }` shape. Existing successful response shapes
remain unchanged.

### Web behavior

Destructive skill and project removal will require explicit confirmation. Mutation failures will render
visible, contextual messages rather than failing silently. API errors will be normalized into concise
user-facing text, without raw status-line prefixes.

Dialogs and inline forms will support autofocus, Enter submission, and Escape cancellation where the
interaction has a cancellable state. Dashboard request failures will render a distinct error state.
Agent toggles will show an error when persistence fails.

Bulk enable/disable will expose a pending state, prevent duplicate submissions, and report partial
failure while preserving successfully applied cells after refetch. It will not attempt transactional
rollback because the API exposes independent per-cell mutations.

### Testing strategy

Work proceeds in red-green-refactor batches. For every registered behavior represented by
`test.fixme`, the fixme is first converted to an active test and run to observe the expected failure.
Additional Vitest or Supertest regressions will be added for core boundaries and performance-sensitive
call counts before production code changes.

Required final acceptance:

1. Dockerized Vitest/Supertest passes with zero failures.
2. Production build succeeds inside the E2E image.
3. Offline Playwright E2E passes with no issue-related `test.fixme` cases remaining.
4. The opt-in network E2E tier is run and reported separately because upstream repositories and network
   availability are external dependencies.
5. `git diff --check` is clean.
6. The staged diff contains no real user home paths, credentials, environment files, certificates,
   private keys, tokens, generated reports, or dependency/build directories.

The offline tier will not add `--network none`; the user explicitly chose not to enforce network
isolation. The existing zero-host-mount and isolated-`HOME` contract remains binding.

## Documentation and issue lifecycle

`.DEVELOPMENT/ISSUES.md` remains the durable registry and `.DEVELOPMENT/TODOLIST.md` remains the forward
work list. After code and tests pass, all 15 entries move to the resolved history with the resolution
date and verification evidence. Completed backlog entries are removed from the active top-three list.

Living documentation that inaccurately calls `BUG-001` active will be corrected. New design and plan
documents use explicit versioned filenames; existing historical documents are preserved.

## Delivery

Implementation occurs on `codex/resolve-open-issues`, based on the pushed baseline commit. Changes are
committed in reviewable domain batches: core/API correctness, CLI behavior, Web feedback/accessibility,
and documentation/acceptance. The branch is pushed only after full verification and a staged-content
security scan. No pull request is created unless the user requests one.
