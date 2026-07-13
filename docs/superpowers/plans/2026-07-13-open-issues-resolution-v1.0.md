# Open Issues Resolution v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 15 open or scheduled issue-registry entries and convert their desired behaviors into passing regressions.

**Architecture:** Preserve the current core/CLI/Express/React boundaries. Central correctness lives in the state manager and registered-project validation; HTTP and CLI surfaces translate those rules into clear errors. Web mutations use normalized API errors and explicit pending, confirmation, and failure states.

**Tech Stack:** Node.js 20 in Docker, TypeScript ESM, Express 4, Commander 12, React 19, TanStack Query 5, Vitest 2, Supertest 7, Playwright 1.49 Chromium.

## Global Constraints

- Work only on `open-issues-resolution`; do not create another branch or worktree.
- Keep the zero-host-mount and isolated-`HOME` Docker contract.
- Do not add `--network none`; network isolation is not required.
- Every behavior change follows red-green-refactor and receives a regression test before production code.
- Preserve API success response shapes and the `{ error: string }` error shape.
- Never stage real home paths, credentials, `.env` files, certificates, keys, generated reports, `node_modules`, or `dist`.
- Keep canonical living documents at their established paths; use explicit `v1.0` filenames for new design and plan documents.

---

### Task 1: Core state, API correctness, and matrix performance

**Issues:** `PERF-001`, `DEBT-001`, `DEBT-002`, `DEBT-004`, `UX-001`

**Files:**
- Modify: `tests/core/state.test.ts`
- Modify: `tests/server/skills.test.ts`
- Modify: `tests/server/projects.test.ts`
- Modify: `e2e/specs/api/contracts.spec.ts`
- Modify: `e2e/specs/cli/enable-disable.spec.ts`
- Modify: `e2e/specs/web/skill-detail.spec.ts`
- Modify: `src/core/state.ts`
- Modify: `src/server/routes/skills.ts`
- Modify: `src/server/routes/projects.ts`

**Interfaces:**
- `StateManager.getDisabled(projectPath): Promise<Record<string, string[]>>` supplies one in-memory snapshot per project.
- `StateManager.enable(...)` throws `Error("Skill not installed: <name>")` before state or symlink mutation when the canonical directory is absent.
- Enable/disable API routes return `404` for an unregistered project and `400` for an agent not assigned to it.

- [ ] **Step 1: Activate and add failing regressions**

Convert the `UX-001`, `DEBT-001`, and `DEBT-002` E2E `test.fixme` calls to `test`. Add unit assertions equivalent to:

```ts
await expect(mgr.enable(projectDir, 'claude-code', 'missing', agentDirs))
  .rejects.toThrow('Skill not installed: missing')
expect(await mgr.getDisabled(projectDir)).toEqual({})

expect(mockStateManager.getDisabled).toHaveBeenCalledTimes(1)
expect(mockStateManager.isDisabled).not.toHaveBeenCalled()
```

Add Supertest cases for unknown skill detail `404`, unregistered project `404`, unassigned agent `400`, and matrix/status results built from `getDisabled`.

- [ ] **Step 2: Verify RED in Docker**

Run:

```bash
docker build -f Dockerfile.test -t skills-ui-test .
docker run --rm skills-ui-test npm test -- tests/core/state.test.ts tests/server/skills.test.ts tests/server/projects.test.ts
```

Expected: failures show missing canonical-skill guard, missing project membership validation, `200` unknown detail, and `isDisabled` call-count mismatches.

- [ ] **Step 3: Implement minimal core and API behavior**

In `src/core/state.ts`, import `access` and guard before reading/writing state:

```ts
const target = join(baseDir, CANONICAL_SKILLS_DIR, skillName)
try {
  await access(target)
} catch {
  throw new Error(`Skill not installed: ${skillName}`)
}
```

In skill detail and project matrix routes, read `getDisabled(project.path)` once and use:

```ts
const disabled = await state.getDisabled(project.path)
status[project.path][agent] = disabled[agent]?.includes(name) ? 'disabled' : 'enabled'
```

Before skill detail metadata parsing, `access()` the canonical skill directory and return `404` on `ENOENT`. Remove `meta ?? s` and return `meta` directly. Before enable/disable, load `registry.getProject(projectPath)`, return `404` when absent, and return `400` unless `project.agents.includes(agent)`.

- [ ] **Step 4: Verify GREEN and refactor**

Run the same Docker command. Expected: all selected Vitest/Supertest files pass with zero warnings.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/core/state.ts src/server/routes/skills.ts src/server/routes/projects.ts tests/core/state.test.ts tests/server/skills.test.ts tests/server/projects.test.ts e2e/specs/api/contracts.spec.ts e2e/specs/cli/enable-disable.spec.ts e2e/specs/web/skill-detail.spec.ts
git commit -m "fix: enforce skill and project state invariants"
```

### Task 2: CLI truthfulness and missing Web build behavior

**Issues:** `UX-002`, `UX-003`, `UX-011`

**Files:**
- Modify: `tests/cli/commands.test.ts`
- Modify: `tests/server/agents.test.ts`
- Modify: `e2e/specs/cli/project.spec.ts`
- Modify: `e2e/specs/cli/add-remove-list.spec.ts`
- Modify: `src/cli/commands/project-add.ts`
- Modify: `src/cli/commands/remove.ts`
- Modify: `src/cli/commands/enable.ts`
- Modify: `src/cli/commands/disable.ts`
- Modify: `src/server/index.ts`

**Interfaces:**
- CLI project registration accepts only an existing absolute directory.
- CLI enable/disable validates supported and project-assigned agents through `ProjectRegistry` before calling state methods.
- `createApp(webDistPathOverride?: string)` permits a deterministic missing-build test.

- [ ] **Step 1: Write failing CLI/server regressions**

Activate the `UX-003` and `UX-011` E2E tests and remove their truth pins. Add CLI unit cases asserting relative and nonexistent paths exit `1`, unknown/unassigned agents exit `1`, and removing an absent canonical skill exits `1` without calling `removeSkill`. Add:

```ts
const app = createApp('/definitely/missing/web-build')
const res = await request(app).get('/')
expect(res.status).toBe(503)
expect(res.text).toContain('npm run build')
```

- [ ] **Step 2: Verify RED in Docker**

```bash
docker build -f Dockerfile.test -t skills-ui-test .
docker run --rm skills-ui-test npm test -- tests/cli/commands.test.ts tests/server/agents.test.ts
```

Expected: CLI false-success and missing-build assertions fail.

- [ ] **Step 3: Implement CLI and server behavior**

Use `isAbsolute` plus `stat(...).isDirectory()` in project add. Use `access(join(homedir(), CANONICAL_SKILLS_DIR, name))` before remove. Enable/disable load the registered project and validate:

```ts
if (!project) throw new Error(`Project not found: ${opts.project}`)
if (!(SUPPORTED_AGENTS as string[]).includes(opts.agent)) {
  throw new Error(`Agent must be one of: ${SUPPORTED_AGENTS.join(', ')}`)
}
if (!project.agents.includes(opts.agent)) {
  throw new Error(`Agent ${opts.agent} is not managed by project ${opts.project}`)
}
```

In `createApp`, resolve an optional Web directory, check `index.html` with `existsSync`, and return status `503` with `Web UI is not built. Run npm run build.` when absent.

- [ ] **Step 4: Verify GREEN and commit**

Run the selected Docker tests, then:

```bash
git add src/cli/commands src/server/index.ts tests/cli/commands.test.ts tests/server/agents.test.ts e2e/specs/cli/project.spec.ts e2e/specs/cli/add-remove-list.spec.ts
git commit -m "fix: reject false-success CLI operations"
```

### Task 3: Web confirmations, normalized errors, and keyboard access

**Issues:** `UX-004`, `UX-005`, `UX-006`, `UX-007`, `UX-008`, `UX-009`

**Files:**
- Modify: `src/web/api.ts`
- Modify: `src/web/pages/Dashboard.tsx`
- Modify: `src/web/pages/Skills.tsx`
- Modify: `src/web/pages/Projects.tsx`
- Modify: `src/web/pages/SkillDetail.tsx`
- Modify: `src/web/components/AddSkillDialog.tsx`
- Modify: `src/web/components/AgentToggle.tsx`
- Modify: `e2e/specs/web/dashboard-nav.spec.ts`
- Modify: `e2e/specs/web/projects.spec.ts`
- Modify: `e2e/specs/web/skills.spec.ts`

**Interfaces:**
- `ApiError extends Error` exposes `status: number` and a concise server-provided message.
- Destructive buttons call `window.confirm` before mutation.
- Each failed mutation renders a visible message with `role="alert"`.

- [ ] **Step 1: Activate failing Web E2E expectations**

Convert `UX-005` through `UX-009` fixmes in the listed files to active tests. Replace one-click removal pins with tests that dismiss a confirmation and assert no DELETE request, then accept it and assert deletion. Add project-form checks for autofocus, Enter submit, and Escape cancel.

- [ ] **Step 2: Verify RED**

```bash
sh e2e/scripts/run-e2e.sh
```

Expected: confirmation, visible-error, normalized-error, dashboard-error, keyboard, and toggle-error tests fail for their registered reasons.

- [ ] **Step 3: Normalize API errors**

Implement:

```ts
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function errorMessage(res: Response): Promise<string> {
  const raw = await res.text()
  try {
    const parsed = JSON.parse(raw) as { error?: string }
    return parsed.error || res.statusText || 'Request failed'
  } catch {
    return raw || res.statusText || 'Request failed'
  }
}
```

Make every non-OK API helper throw `ApiError` via this function, including DELETE helpers.

- [ ] **Step 4: Add explicit interaction states**

Use `window.confirm('Remove skill <name>?')` and `window.confirm('Remove project <name>?')`. Render mutation errors with `role="alert"`. Wrap add forms in `<form onSubmit={...}>`, set `autoFocus`, handle Escape, and set cancel buttons to `type="button"`. Dashboard renders `Failed to load skills` or `Failed to load projects` instead of `—` on query error. `AgentToggle` renders `Failed to update <skillName> for <agent>` on mutation error.

In `SkillDetail`, render `Skill not found` when `error instanceof ApiError && error.status === 404`.

- [ ] **Step 5: Verify GREEN and commit**

Run offline E2E. Expected: Task 3 cases pass. Then:

```bash
git add src/web e2e/specs/web
git commit -m "fix: surface actionable Web mutation feedback"
```

### Task 4: Bulk-operation progress and partial failure

**Issue:** `UX-010`

**Files:**
- Modify: `src/web/pages/ProjectDetail.tsx`
- Modify: `e2e/specs/web/projects.spec.ts`

**Interfaces:**
- Bulk operations use `Promise.allSettled` and throw `Error("<n> changes failed")` after all cells settle.
- Both bulk buttons are disabled while either bulk mutation is pending.
- Query invalidation runs in `onSettled` so successful cells refetch even when part of the batch fails.

- [ ] **Step 1: Activate the failing partial-failure test**

Convert the `UX-010` fixme to `test`, assert the clicked button shows `Disabling...` while pending, and assert a visible `role="alert"` contains `changes failed` after a routed `500`.

- [ ] **Step 2: Verify RED**

```bash
sh e2e/scripts/run-e2e.sh
```

Expected: no pending label and no partial-failure alert.

- [ ] **Step 3: Implement and verify GREEN**

Replace `Promise.all` with:

```ts
const results = await Promise.allSettled(operations)
const failed = results.filter(result => result.status === 'rejected').length
if (failed) throw new Error(`${failed} changes failed`)
```

Render the error and pending labels, invalidate in `onSettled`, rerun offline E2E, then commit:

```bash
git add src/web/pages/ProjectDetail.tsx e2e/specs/web/projects.spec.ts
git commit -m "fix: report bulk operation progress and failures"
```

### Task 5: Documentation, registry reconciliation, and acceptance

**Issues:** Close all 15 entries after evidence exists.

**Files:**
- Modify: `.DEVELOPMENT/ISSUES.md`
- Modify: `.DEVELOPMENT/TODOLIST.md`
- Modify: `DEVELOPMENT.md`
- Modify: `e2e/README.md`
- Create: `docs/testing/functional-interaction-test-design-v1.1.md`
- Preserve: `docs/testing/functional-interaction-test-design.md`

- [ ] **Step 1: Reconcile documentation**

Copy the testing design to the versioned `v1.1` filename, update its status and automation findings, and repoint canonical links to it. Correct stale `BUG-001` language in `e2e/README.md`. Move all 15 entries to resolved history with date `2026-07-13` and evidence. Refresh the todolist so it contains only genuinely unfinished work discovered during implementation; if none exists, state that the registered backlog is empty.

- [ ] **Step 2: Run full acceptance**

```bash
docker build -f Dockerfile.test -t skills-ui-test .
docker run --rm skills-ui-test
sh e2e/scripts/run-e2e.sh
sh e2e/scripts/run-e2e.sh --network
git diff --check
```

Expected: Docker unit/integration and offline E2E exit `0`; no issue-related `test.fixme` remains. Report network failures separately only when they are caused by upstream/network instability.

- [ ] **Step 3: Security scan and final commit**

Scan staged names and diff for real `/Users/<name>/`, secrets, tokens, private keys, `.env`, reports, `node_modules`, and `dist`. Stage only intended source, tests, and versioned/living docs, then:

```bash
git commit -m "docs: close resolved issue registry"
git push origin open-issues-resolution
```

- [ ] **Step 4: Update PR**

Use `gh pr edit 1 --body-file <validated-body-file>` to record resolved issues and exact acceptance counts. Keep the PR draft until the user chooses to mark it ready.
