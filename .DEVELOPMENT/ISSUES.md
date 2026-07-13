# skills-ui — Issue Registry

Durable defects, tech-debt, UX gaps, and optimization needs. This is the global, long-lived record;
forward work lives in [`TODOLIST.md`](./TODOLIST.md).

**Entry shape:** id `<BUG|DEBT|UX|PERF>-NNN` (never reused) · severity · status
(`open` / `scheduled` / `resolved`) · discovered date · where it lives in code · how it was found.
When an entry is scheduled, cross-link the TODOLIST task. When resolved, move it to
*Resolved (history)* with a date.

Seeded 2026-07-06 by `suggested-todolist` from a source review. Extended 2026-07-09 with UX findings
from [`docs/testing/functional-interaction-test-design.md`](../docs/testing/functional-interaction-test-design.md)
(each UX entry cross-links its `F-###` finding id and the test case that exposes it).

## Open / Scheduled

### PERF-001 — Nested per-(skill, agent) state.json reads
- **severity:** medium
- **status:** scheduled → TODOLIST "Batch state reads when building status/matrix"
- **discovered:** 2026-07-06
- **where:** `src/server/routes/skills.ts` (`GET /:name`) and `src/server/routes/projects.ts`
  (`GET /:projectPath`) — `state.isDisabled()` is called inside `skill × agent` loops, and each call
  re-reads/parses the entire `state.json` (`src/core/state.ts` → `readJson`).
- **how found:** source review of the status/matrix builders.

### DEBT-001 — enable/disable skip project + agent validation (both surfaces) · F-CLI-02
- **severity:** medium
- **status:** scheduled → TODOLIST "Validate project + agent membership on enable/disable"
- **discovered:** 2026-07-06 (CLI parity gap added 2026-07-09)
- **where:** `src/server/routes/skills.ts` — `POST /:name/enable` and `/disable` validate only that
  `projectPath`/`agent` are present and that `agent ∈ SUPPORTED_AGENTS`; they never check the project is
  registered or that the agent is in the project's `agents` list, so `state.json` can accumulate entries
  for unknown projects. Contrast with `POST /api/projects`, which validates absolute + existing paths.
  The **CLI** is worse (`src/cli/commands/enable.ts`, `disable.ts`): it does not even check
  `SUPPORTED_AGENTS`, so `enable <s> --project /nope --agent typo` prints `✓` — a false success.
- **how found:** comparing validation between `projects.ts` and `skills.ts` routes; CLI parity gap
  confirmed while designing test cases CLI-ENABLE-03/04 (finding `F-CLI-02`).

### UX-001 — Unknown skill detail returns 200 with placeholder metadata · F-WEB-06
- **severity:** low
- **status:** scheduled → TODOLIST "Return 404 for unknown skill detail"
- **discovered:** 2026-07-06
- **where:** `src/server/routes/skills.ts` `GET /:name` → `parseSkillMetadata` falls back to
  `{ name: dirName, description: '' }` for a nonexistent skill, so the route responds `200` instead of
  `404`. Downstream, `src/web/pages/SkillDetail.tsx` renders the placeholder as if the skill exists
  instead of a not-found state.
- **how found:** tracing `parseSkillMetadata` fallbacks (`src/core/metadata.ts`); UI impact confirmed
  by test case WEB-SKILLDETAIL-03 (finding `F-WEB-06`).

### DEBT-002 — enable can create a dangling symlink to an uninstalled skill · F-CLI-03
- **severity:** low
- **status:** scheduled → TODOLIST "Guard against dangling enable symlinks"
- **discovered:** 2026-07-06
- **where:** `src/core/state.ts` → `enable()` symlinks to `join(baseDir, CANONICAL_SKILLS_DIR, skillName)`
  without checking the target exists.
- **how found:** source review of the enable path; reproduced by test case CLI-ENABLE-05
  (finding `F-CLI-03`).

### DEBT-003 — Fragile `skills list` stdout parsing (superseded by BUG-001, resolved with it)
- **severity:** low
- **status:** resolved (2026-07-10) — the BUG-001 rewrite replaced the fragile substring filter with a format-aware parser covered by unit regression tests for both the legacy and 1.4.x output formats
- **discovered:** 2026-07-06
- **where:** `src/core/skills-cli.ts` → `listSkills()` splits stdout by line and drops lines containing
  the substring `"no skills"`; brittle to CLI output changes and to a skill name containing that text.
- **how found:** source review of the `skills` CLI wrapper.

### DEBT-004 — Dead `meta ?? s` fallback
- **severity:** trivial
- **status:** scheduled → TODOLIST "Remove dead metadata fallback"
- **discovered:** 2026-07-06
- **where:** `src/server/routes/skills.ts` `GET /` — `parseSkillMetadata` never returns nullish, so the
  `meta ?? s` fallback is unreachable.
- **how found:** source review.

### UX-002 — SPA fallback errors when web build is absent · F-WEB-08
- **severity:** low
- **status:** open
- **discovered:** 2026-07-06
- **where:** `src/server/index.ts` → `app.get('*')` `sendFile(dist/web/index.html)`; running `serve`
  before `npm run build:web` produces an unhandled `sendFile` error instead of a helpful message.
- **how found:** source review of `createApp` static/SPA handling; reproduced by test case CLI-SERVE-03
  (finding `F-WEB-08`).

### UX-003 — `project add` registers non-existent / relative paths silently · F-CLI-01
- **severity:** medium
- **status:** open
- **discovered:** 2026-07-09
- **where:** `src/cli/commands/project-add.ts` — `resolve()`s the path and calls `registerProject`
  without an existence check, printing `✓ Registered`. `POST /api/projects` (`src/server/routes/projects.ts`)
  rejects relative and non-existent paths with `400`. The two surfaces disagree, and the CLI reports a
  false success (bogus project in `config.json`).
- **how found:** designing test cases CLI-PROJ-03/04 (finding `F-CLI-01`).

### UX-004 — Destructive Remove has no confirmation (Skills & Projects) · F-WEB-01
- **severity:** high
- **status:** open
- **discovered:** 2026-07-09
- **where:** `src/web/pages/Skills.tsx` and `src/web/pages/Projects.tsx` — the "Remove" button calls
  `removeMutation.mutate(...)` / `removeMutation.mutate(project.path)` immediately on click; no confirm
  dialog, no undo. A misclick uninstalls a skill (for all projects) or unregisters a project.
- **how found:** designing test cases WEB-SKILLS-03 / WEB-PROJ-03 (finding `F-WEB-01`).

### UX-005 — Silent mutation failures (no onError) · F-WEB-02
- **severity:** high
- **status:** open
- **discovered:** 2026-07-09
- **where:** `src/web/pages/Skills.tsx` (`removeMutation`), `src/web/pages/Projects.tsx`
  (`addMutation`, `removeMutation`) — none define `onError`, so a failed request shows nothing. Most
  visible: adding an invalid/relative/non-existent project path returns `400` but the form silently
  stays open with no message, so the user thinks the click did nothing.
- **how found:** designing test cases WEB-SKILLS-04 / WEB-PROJ-02 (finding `F-WEB-02`).

### UX-006 — Add-skill errors surface raw HTTP text · F-WEB-03
- **severity:** medium
- **status:** open
- **discovered:** 2026-07-09
- **where:** `src/web/api.ts` `json()` throws `Error("<status> <statusText>: <body>")`, which
  `src/web/components/AddSkillDialog.tsx` renders verbatim — not a human-readable, actionable message.
- **how found:** designing test case WEB-ADD-02 (finding `F-WEB-03`).

### UX-007 — Dialogs lack keyboard affordances · F-WEB-04
- **severity:** medium
- **status:** open
- **discovered:** 2026-07-09
- **where:** `src/web/components/AddSkillDialog.tsx` and the inline add form in
  `src/web/pages/Projects.tsx` — no Enter-to-submit, no Esc-to-cancel, no autofocus on the input.
  Keyboard users must mouse to the button.
- **how found:** designing test case WEB-ADD-03 (finding `F-WEB-04`).

### UX-008 — Dashboard cannot distinguish loading from error · F-WEB-05
- **severity:** low
- **status:** open
- **discovered:** 2026-07-09
- **where:** `src/web/pages/Dashboard.tsx` — both the loading and error states render `—`
  (`skills.data?.length ?? '—'`); there is no error branch, so a failed `/api/skills` is
  indistinguishable from a slow load.
- **how found:** designing test case WEB-DASH-02 (finding `F-WEB-05`).

### UX-009 — Agent toggle fails silently · F-WEB-07
- **severity:** medium
- **status:** open
- **discovered:** 2026-07-09
- **where:** `src/web/components/AgentToggle.tsx` — the toggle mutation has no `onError`; on failure the
  switch snaps back to server truth after invalidation with no message, so the click looks ignored.
- **how found:** designing test case WEB-PROJDETAIL-02 (finding `F-WEB-07`).

### UX-010 — Bulk enable/disable has no progress or partial-failure feedback · F-WEB-09
- **severity:** medium
- **status:** open
- **discovered:** 2026-07-09
- **where:** `src/web/pages/ProjectDetail.tsx` — `enableAll`/`disableAll` fan out `N×M` parallel
  `enableSkill`/`disableSkill` calls with no pending UI; on partial failure the grid just refetches and
  some cells silently stay unchanged.
- **how found:** designing test case WEB-PROJDETAIL-03 (finding `F-WEB-09`).

### UX-011 — `remove` of a nonexistent skill reports false success
- **severity:** medium
- **status:** open
- **discovered:** 2026-07-10
- **where:** `src/cli/commands/remove.ts` (and `DELETE /api/skills/:name` shares the path) — the
  bundled `skills remove <ghost> -g -y` prints `No skills found to remove.` but **exits 0**, so
  skills-ui prints `✓ Removed <ghost>` (exit 0) for a skill that never existed. R7 truthfulness
  violation; the API variant returns 204 for the same no-op.
- **how found:** full offline E2E run, case CLI-REMOVE-02 failed its designed expectation
  (exit 1 + error); root cause confirmed by driving the bundled binary directly in-container.
  Covered by fixme `UX-011` + truth-pin in `e2e/specs/cli/add-remove-list.spec.ts`.

## Resolved (history)

### BUG-001 — `listSkills()` parsing is broken against bundled skills@1.4.5 output
- **severity:** high
- **status:** resolved (2026-07-10) — parser rewritten in `src/core/skills-cli.ts`: strips ANSI, skips header/`Agents:`/hint lines, splits names on the `~/` path suffix (spaces survive), normalizes both empty-store messages to `[]`. Regression-tested in `tests/core/skills-cli.test.ts`; 7 E2E fixmes flipped to passing (57 passed / 0 failed offline). CLI `list` now also enriches descriptions from SKILL.md like the API.
- **discovered:** 2026-07-09
- **where:** `src/core/skills-cli.ts` → `listSkills()`. The bundled `skills@1.4.5` binary emits
  ANSI-colored, multi-line output even when piped (`NO_COLOR`/`FORCE_COLOR` are ignored — colors are
  hardcoded): a `Global Skills` header line, per-skill lines of the form `<ansi>name<ansi> <ansi>~/.agents/skills/name<ansi>`,
  and `Agents: …` detail lines. `listSkills()` treats every non-empty line as a skill name, so it
  returns garbage entries (header, name+path with escape codes, agents lines). Empty store is also
  broken: the binary prints `No global skills found.`, which does **not** match the `"no skills"`
  substring filter, so an empty store parses as **2 phantom skills**.
- **blast radius:** `skills-ui list` (garbage lines; empty message never shown), `GET /api/skills`
  (garbage list → Dashboard count wrong even at zero; Skills page rows are ANSI junk),
  `GET /api/projects/:path` matrix keys (garbage names → toggles target nonexistent skills),
  `list --project` per-agent status (disabled state never matches the mangled names).
- **additional nuance:** `skills list -g` validates frontmatter — a SKILL.md without a
  `description` (or unparsable frontmatter) is silently omitted from the listing, though
  `GET /api/skills/:name` still reads such skills directly from disk. Listing truth ≠ disk truth.
- **how found:** E2E environment probes inside Docker (seeded store + direct `listSkills()`
  invocation), 2026-07-09. Supersedes the "fragile parsing" suspicion in DEBT-003 — the parsing is
  not fragile but presently non-functional. Pinned by E2E spec `api/contracts.spec.ts`
  (BUG-001 pin) and fixme'd desired-behavior specs across `cli/` and `web/`.
- **fix direction (for later):** strip ANSI (`/\[[0-9;]*m/g`), skip header/`Agents:`/hint
  lines, take the first whitespace-delimited token as the name, and treat `No global skills found.`
  as empty; or bypass the binary for listing and `readdir` the canonical store directly.
