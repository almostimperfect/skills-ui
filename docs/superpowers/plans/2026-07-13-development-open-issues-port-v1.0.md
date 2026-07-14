# Development Open-Issue Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-audit and port the 15 previously resolved findings onto the active `development` architecture, validate them in Docker, merge through `development`, then open the protected `development → main` PR.

**Architecture:** Preserve development's inventory/status/maintenance model. Treat findings tied to deleted `state.ts` as satisfied by the new model and add regressions at the current API/CLI boundaries. Implement remaining interaction behavior in the current React pages and typed API client. Add a focused Docker/Playwright acceptance layer for the development product instead of importing obsolete main-era response shapes.

**Tech Stack:** Node.js 20 in Docker, TypeScript ESM, Express 4, React 19, TanStack Query 5, Vitest 2, Supertest, Playwright 1.49.

## Global Constraints

- Base all implementation on `origin/development@7c76ce8`.
- Do not reintroduce `src/core/state.ts` or the old symlink-state model.
- Do not mount the host HOME, repository, credentials, or skill store into test containers.
- Use test-first red/green cycles for every behavior change.
- Do not expose real host paths or secrets in source, tests, docs, commits, or PR text.
- Use the branch `development-open-issues-resolution`; no `codex/` or `agent/` prefix and no worktree.
- Keep PR #1 paused; publish a separate development-targeted PR after validation.

---

### Task 1: Baseline and finding audit

**Files:**
- Create: `Dockerfile.test`
- Create: `.dockerignore`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `docs/testing/development-open-issues-acceptance-v1.0.md`

**Interfaces:**
- Consumes: development inventory APIs (`resolveSkillRef`, `buildProjectSkillStatus`).
- Produces: isolated build/test command and a 15-row audit map used by later tasks.

- [ ] Add Docker test scripts and a COPY-only Node 20 test image.
- [ ] Run the untouched development suite in Docker; expected baseline is all existing tests passing.
- [ ] Record each finding as `already satisfied`, `obsolete under inventory/status`, or `requires port`.
- [ ] Commit with `test: add development Docker baseline`.

### Task 2: Server and CLI truthfulness

**Files:**
- Modify: `tests/cli/commands.test.ts`
- Modify: `tests/server/skills.test.ts`
- Create: `tests/server/index.test.ts`
- Modify: `src/cli/commands/project-add.ts`
- Modify: `src/server/index.ts`

**Interfaces:**
- Consumes: `createProjectRegistry`, `createInventoryManager`, `createApp`.
- Produces: CLI rejection of relative/missing/non-directory projects and actionable HTTP 503 for a missing Web build.

- [ ] Write CLI tests expecting relative, missing, and non-directory paths to exit 1 before registry mutation.
- [ ] Run focused tests and confirm failures come from current `resolve()`/no-stat behavior.
- [ ] Implement `isAbsolute` + `stat().isDirectory()` validation with concise `Error:` output.
- [ ] Write a Supertest case calling `createApp('/definitely/missing/web-build')` and expecting 503 plus `npm run build` guidance.
- [ ] Run it red against the current unconditional `sendFile` fallback.
- [ ] Add an optional Web dist override and explicit index existence check.
- [ ] Run focused and full Docker tests green.
- [ ] Commit with `fix: enforce development CLI and server validation`.

### Task 3: Typed Web errors and safe interaction

**Files:**
- Create: `tests/web/api.test.ts`
- Modify: `src/web/api.ts`
- Modify: `src/web/pages/Skills.tsx`
- Modify: `src/web/pages/Projects.tsx`
- Modify: `src/web/components/AddSkillDialog.tsx`
- Modify: `src/web/components/AgentToggle.tsx`
- Modify: `src/web/pages/SkillDetail.tsx`

**Interfaces:**
- Produces: `ApiError(status: number, message: string)`; all response helpers throw it after extracting JSON `{ error }` or plain text.

- [ ] Write API-client tests for JSON error, plain text, and status retention; confirm the current raw HTTP string fails them.
- [ ] Implement `ApiError`, shared `expectOk`, and message extraction for JSON/plain/empty bodies.
- [ ] Add confirmation before project removal and preserve the existing global uninstall confirmation.
- [ ] Render `role="alert"` for failed skill/project mutations and failed agent toggles.
- [ ] Convert add-skill and add-project controls to forms with autofocus, Enter submit, Escape cancel, and explicit button types.
- [ ] Render `Skill not found` when `getSkill` throws `ApiError(404)`.
- [ ] Run unit/build checks green.
- [ ] Commit with `fix: port actionable Web feedback to development`.

### Task 4: Bulk progress and partial failures

**Files:**
- Create: `tests/web/bulk-actions.test.ts`
- Modify: `src/web/pages/ProjectDetail.tsx`

**Interfaces:**
- Produces: exported `settleChanges(changes)` returning normally when all fulfill and throwing `N change(s) failed` after all requests settle.

- [ ] Write tests proving all operations settle and failures are counted; confirm the helper is absent.
- [ ] Implement `settleChanges` with `Promise.allSettled`.
- [ ] Use it in both bulk mutations, invalidate on settled, disable both buttons while pending, show action-specific pending labels, and render an alert on failure.
- [ ] Run focused and full Docker tests green.
- [ ] Commit with `fix: report development bulk action failures`.

### Task 5: Development-focused browser acceptance

**Files:**
- Create: `Dockerfile.e2e`
- Create: `e2e/playwright.config.ts`
- Create: `e2e/helpers/env.ts`
- Create: `e2e/helpers/skills-store.ts`
- Create: `e2e/specs/development-findings.spec.ts`
- Create: `e2e/scripts/run-e2e.sh`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Starts the built Express app with a unique in-container HOME per worker.
- Exercises current asset IDs and structured status objects, not the retired matrix/string model.

- [ ] Add Playwright 1.49 and a COPY-only E2E image with zero runtime mounts.
- [ ] Add focused browser/API/CLI cases for project path rejection, missing build, remove confirmation, visible errors, keyboard interaction, not-found, toggle error, and bulk partial failure.
- [ ] Run the new cases red before Web production changes where applicable, then green after Tasks 2–4.
- [ ] Run the complete Vitest/Supertest suite, production build, and focused E2E suite in Docker.
- [ ] Commit with `test: add development interaction acceptance`.

### Task 6: Documentation, security review, and development PR

**Files:**
- Modify: `DEVELOPMENT.md`
- Modify: `README.md`
- Modify: `docs/TODOLIST.md`
- Create: `docs/testing/development-open-issues-acceptance-v1.1.md`

**Interfaces:**
- Produces: current development acceptance record and PR evidence.

- [ ] Preserve v1.0 acceptance audit and write v1.1 with final results.
- [ ] Update living docs for Docker commands and current interaction guarantees.
- [ ] Run `git diff --check`, scan changed content for real host paths/tokens/private keys, and verify the worktree scope.
- [ ] Run fresh full Docker unit/build/E2E acceptance.
- [ ] Push `development-open-issues-resolution` and create a ready PR targeting `development`.
- [ ] Close superseded PR #1 after linking the replacement.
- [ ] Merge the development PR after its checks pass.

### Task 7: Protected development-to-main PR

**Files:** none.

**Interfaces:**
- Consumes: updated `origin/development` containing the validated port.
- Produces: a protected PR from `development` to `main` requiring one approving review.

- [ ] Refresh remote refs and verify development contains the merged port.
- [ ] Create a ready PR with base `main`, head `development`, migration summary, and Docker evidence.
- [ ] Do not bypass the `Protect Main` ruleset or self-claim approval; report the required reviewer action.

## Self-Review

- All 15 findings map either to a current regression or an explicit obsolete/satisfied classification.
- No task restores old state/symlink architecture.
- Production changes follow failing tests; final claims require fresh Docker evidence.
- The plan covers all five user-requested flow stages, including the protected final PR.
