# skills-ui — Prioritized Todolist

Forward execution backlog, grounded in the current implementation (`src/core`, `src/server`,
`src/cli`), `DEVELOPMENT.md`, and `README.md`. Known defects and tech-debt live in
[`ISSUES.md`](./ISSUES.md); this file is the *forward* work.

Seeded 2026-07-06 by `suggested-todolist`.

## Top 3 Next Tasks

### 0. ~~Fix `listSkills()` parsing against skills@1.4.5 (BUG-001)~~ — DONE 2026-07-10
- **priority:** P0
- **type:** feature
- **status:** done — parser rewritten with unit regressions; 7 E2E fixmes flipped green
  (57 passed / 0 failed offline); CLI `list` now shows descriptions. BUG-001 + DEBT-003 moved to
  Resolved in ISSUES.md.
### 1. ~~Add CLI command tests~~ — DONE 2026-07-10
- **priority:** P0
- **type:** testing
- **status:** done — `tests/cli/commands.test.ts` (18 tests): every command's happy path + primary
  error path (SkillsCliError exit 1, unknown project, invalid port, --agents split), core mocked.

### 2. ~~Test the skill enable/disable routes~~ — DONE 2026-07-10
- **priority:** P0
- **type:** testing
- **status:** done — 8 Supertest cases added to `tests/server/skills.test.ts`: success payload +
  state args, 400 missing fields, 400 non-whitelisted agent (message lists valid agents), 500 path.

### 3. Batch state reads when building status/matrix
- **priority:** P1
- **type:** performance
- **why now:** `GET /api/skills/:name` and `GET /api/projects/:projectPath` call
  `state.isDisabled(...)` inside nested `skill × agent` loops, and each call re-reads and re-parses the
  whole `state.json` from disk. Cost grows as `O(skills × agents)` file reads per request. See
  [PERF-001](./ISSUES.md).
- **definition of done:** read the project's disabled map once (e.g. via `state.getDisabled(projectPath)`)
  and compute statuses in memory; existing route tests still pass.
- **status:** todo

## Backlog

### Validate project + agent membership on enable/disable
- **priority:** P1 · **type:** feature · **status:** todo
- **why now:** `POST /api/projects` validates that a path is absolute and exists, but the enable/disable
  routes accept any `projectPath` and write `state.json` for unregistered projects / agents not in the
  project's `agents` list. This diverges from the registry-as-source-of-truth model. See
  [DEBT-001](./ISSUES.md).
- **done when:** enable/disable return `404` for an unregistered project and `400` for an agent the
  project doesn't manage, with matching tests.

### Return 404 for unknown skill detail
- **priority:** P1 · **type:** feature · **status:** todo
- **why now:** `GET /api/skills/:name` returns `200` with placeholder metadata (`name = dirName`,
  empty description) for a skill that isn't installed, instead of `404`. See [UX-001](./ISSUES.md).
- **done when:** the route checks the canonical skill dir exists and returns `404` otherwise; test added.

### Guard against dangling enable symlinks
- **priority:** P2 · **type:** feature · **status:** todo
- **why now:** `state.enable` creates a symlink to `~/.agents/skills/<name>` without checking the target
  exists, so enabling an uninstalled skill produces a dangling link. See [DEBT-002](./ISSUES.md).
- **done when:** enable verifies the canonical skill exists (or the route rejects unknown skills) before
  creating the symlink.

### Remove dead metadata fallback
- **priority:** P2 · **type:** testing · **status:** todo
- **why now:** `parseSkillMetadata` always resolves to an object, so `meta ?? s` in
  `src/server/routes/skills.ts` is dead. See [DEBT-004](./ISSUES.md).
- **done when:** the `?? s` fallback is removed and the list route still returns enriched metadata.

### Graceful SPA fallback when web build is absent
- **priority:** P2 · **type:** feature · **status:** todo
- **why now:** `app.get('*')` `sendFile(index.html)` errors if `dist/web` hasn't been built (e.g. running
  `serve` before `npm run build:web`). See [UX-002](./ISSUES.md).
- **done when:** a missing build returns a clear message pointing at `npm run build` instead of an
  unhandled `sendFile` error.

## Notes

- This backlog was derived from a read of the current source; it does not yet reflect the `src/web` React
  pages in depth. A follow-up pass should review `src/web/pages/*` for UX/testing gaps.
- Keep this file and `ISSUES.md` in sync: when a task here closes a registry issue, flip the issue to
  `resolved` and cross-link it.
