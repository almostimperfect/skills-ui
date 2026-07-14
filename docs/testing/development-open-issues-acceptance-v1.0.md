# Development Open-Issues Acceptance Audit v1.0

**Date:** 2026-07-13

**Base:** `origin/development@7c76ce8`

**Purpose:** Map the 15 findings previously resolved against `main` onto development's current
inventory/status architecture before changing production code.

## Audit map

| Finding | Development status before port | Evidence / required action |
|---|---|---|
| PERF-001 | obsolete/satisfied | Deleted `state.ts`; status derives from one reconciled inventory object in `status.ts`. |
| DEBT-001 | mostly satisfied | API and CLI resolve registered projects and current status; retain boundary regressions. |
| UX-001 | API satisfied, Web missing | API returns 404 from `resolveSkillRef`; add typed 404 rendering in `SkillDetail`. |
| DEBT-002 | satisfied | Enable resolves a known inventory skill before any install operation. |
| DEBT-004 | obsolete | Retired list metadata fallback no longer exists. |
| UX-002 | missing | SPA fallback still unconditionally sends `dist/web/index.html`. |
| UX-003 | missing in CLI | `project add` still resolves relative paths and does not stat the target. |
| UX-004 | partial | Global uninstall confirms; project removal does not. |
| UX-005 | missing/partial | Project add/remove and global uninstall mutations do not render errors. |
| UX-006 | missing | API client still exposes raw status/statusText/body strings. |
| UX-007 | missing | Add asset and project forms lack autofocus, Escape, and form submit semantics. |
| UX-008 | satisfied for skills | Dashboard renders a distinct skill-load error; preserve via acceptance. |
| UX-009 | missing | `AgentToggle` has no visible failed-mutation feedback. |
| UX-010 | missing | Bulk operations use fail-fast `Promise.all` with no shared pending/error UI. |
| UX-011 | satisfied | CLI/API resolve the skill first and return error/404 when absent. |

## Port policy

- Do not transplant the old string matrix or symlink state manager.
- Add tests at current inventory/status boundaries for satisfied and obsolete findings.
- Implement only the behaviors still absent from development.
- Publish final results as a new v1.1 file; preserve this pre-change audit.
