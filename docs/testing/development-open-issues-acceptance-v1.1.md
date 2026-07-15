# Development Open-Issues Acceptance Audit v1.1

**Date:** 2026-07-13

**Base:** `origin/development@7c76ce8`

**Implementation branch:** `development-open-issues-resolution`

## Result

All 15 findings were re-audited against development's inventory/status architecture. Eight
findings were already satisfied or obsolete on development; the seven remaining behavior gaps
were implemented without restoring the retired state manager or string matrix.

| Finding | Final status | Acceptance evidence |
|---|---|---|
| PERF-001 | accepted | Status derives from the reconciled inventory; the retired `state.ts` path remains absent. |
| DEBT-001 | accepted | API and CLI operate on registered projects and current reconciled status. |
| UX-001 | fixed | Unknown asset API errors retain status and the Web UI renders `Skill not found` for 404. |
| DEBT-002 | accepted | Project enable resolves a known inventory asset before installation. |
| DEBT-004 | accepted as obsolete | The retired list metadata fallback was not reintroduced. |
| UX-002 | fixed | Missing Web build output returns an actionable 503 instead of an unconditional file send. |
| UX-003 | fixed | CLI project registration requires an existing absolute directory. |
| UX-004 | fixed | Global uninstall and project removal both require confirmation. |
| UX-005 | fixed | Add/remove/install mutations render visible user-facing errors. |
| UX-006 | fixed | The API client extracts JSON or text server messages into a typed `ApiError`. |
| UX-007 | fixed | Add Asset and Add Project support autofocus, Escape, and Enter submission. |
| UX-008 | accepted | Dashboard API failure remains distinct from loading and is covered by E2E. |
| UX-009 | fixed | Failed per-agent toggles render the server error next to the control. |
| UX-010 | fixed | Bulk operations expose shared pending state and preserve/report partial results. |
| UX-011 | accepted | Missing CLI/API asset references fail before mutation. |

## Verification

- Unit/integration: 13 files, 69 tests passed.
- Production build: TypeScript server compile and Vite Web bundle passed.
- Browser acceptance: 8 Playwright tests passed in Docker.
- Privacy scan: no private-key markers, common token patterns, or host user paths found in changed files.
- Dependency audit baseline: the original Docker baseline reported 16 advisories; adding the fixed
  Playwright test toolchain produced 18 advisories. No forced dependency upgrades were applied as
  part of the behavior-fix scope.

## Test infrastructure note

`Dockerfile.test` now verifies that Vitest was actually installed after `npm ci`, preventing an npm
client exit-handler anomaly from producing a falsely successful but incomplete image. The E2E
image contains its own build and browser runtime and uses only synthetic `/tmp/e2e` fixture paths.
