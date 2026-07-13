# skills-ui — Functional & Interaction Test Design

**Status:** automated (Playwright E2E in `e2e/`, Docker-only; §9) — manual walkthrough remains valid
**Surfaces:** CLI + Web UI + API
**Authored:** 2026-07-09 (extended same day with §9 Automation and finding BUG-001)
**Lens:** functional correctness **and** interaction quality — usability ("好用") and clarity ("清晰")

---

## 1. Purpose, Scope, Personas

### Why this document exists

The current automated suite (39 Vitest/Supertest tests) mocks the entire `src/core/*` layer or
`child_process`. It verifies units in isolation and **cannot tell us**:

- whether a real, end-to-end user flow actually works (install → register → toggle → verify on disk);
- whether the CLI and Web experiences are *usable and clear* (feedback, confirmations, error wording,
  empty/loading/error states).

This document designs **functional and interaction tests from a user's perspective** to close that gap.
It is a manual test plan: each case is written so a human (or a future automation pass) can execute it
against a running instance.

### Persona

**"Dana", a developer** who manages agent skills across several local projects. Dana:

- installs skills from GitHub or local paths,
- registers projects and expects skills-ui to notice which agents each project uses,
- turns individual skills on/off per agent per project,
- expects destructive actions to be safe, errors to be legible, and success to be *real*.

Dana is not expected to read source code, know HTTP status codes, or guess why a click did nothing.

### Scope

- **In:** CLI commands (`add`, `remove`, `list`, `enable`, `disable`, `projects`, `project add`,
  `serve`) and the Web UI (Dashboard, Skills, Skill Detail, Projects, Project Detail, Add Skill dialog,
  agent toggles, bulk actions).
- **Out:** performance/load, security, and *fixing* any defect found (findings are recorded in §6, not
  fixed here).

### "Functional" vs "interaction"

- **Functional** — does the operation produce the correct result and correct on-disk state?
- **Interaction** — is the operation usable and clear? Judged against the rubric in §3. A case can pass
  functionally but fail interaction (e.g. the state changes correctly but the user gets no feedback).

---

## 2. Test Approach & Isolation

Everything here writes real state — `~/.skills-ui/{config,state}.json`, the global `~/.agents/skills`
store — and spawns the real `skills` binary. **Never run these against your primary environment.** Use
one of the two isolated setups below (both established in `DEVELOPMENT.md`).

### CLI execution — inside Docker

```bash
npm run test:docker:shell     # build image + drop into a shell in a throwaway container
# inside the container:
npm run build                 # compile dist/cli
node dist/cli/index.js --help # drive the built binary; or `npm link` to get `skills-ui`
```

The container has its own `$HOME`; all `~/.skills-ui` / `~/.agents` writes stay inside it and vanish on
exit. Reset between cases with `rm -rf ~/.skills-ui ~/.agents` in the container.

### Web execution — serve + browser

```bash
# In a disposable/container shell, or a throwaway HOME on the host:
HOME=$(mktemp -d) npm run build && HOME=$(mktemp -d) node dist/cli/index.js serve --port 3456
```

Then walk the UI at `http://localhost:3456`. For dev iteration, `npm run dev:web` (Vite, port 5173,
proxying `/api` → 3456) works but is not the shipped artifact — final interaction sign-off should use
the built SPA served by `serve`.

> To exercise Web flows without a working `skills` binary (e.g. empty/error states), point at a HOME
> with a hand-written `~/.skills-ui/config.json` and an empty `~/.agents/skills/`.

### Case ID scheme & template

- CLI cases: `CLI-<AREA>-NN` (e.g. `CLI-ADD-01`)
- Web cases: `WEB-<PAGE>-NN` (e.g. `WEB-SKILLS-02`)
- Findings: `F-CLI-NN` / `F-WEB-NN`

```
ID · Title
Preconditions:
Steps (user actions):
Expected functional result:
Usability/clarity acceptance criteria:      ← the 好用/清晰 bar
Status: pass | FINDING (→ gap id) | needs-manual
```

`Status` is the *designer's expectation* from reading the code; the tester confirms it. `FINDING` marks
a case expected to fail the interaction bar today, cross-linked to §6.

---

## 3. Usability & Clarity Rubric

Every case is scored against these seven checks. A violation of any is an interaction finding even if
the function "works".

| # | Check | What "good" looks like |
|---|-------|------------------------|
| R1 | **Feedback** | Every action yields visible success *or* failure feedback. No silent no-ops. |
| R2 | **Destructive safety** | Irreversible remove/unregister asks for confirmation (or offers undo). |
| R3 | **Error clarity** | Messages are human-readable and actionable — not raw HTTP status/body or a stack trace. |
| R4 | **State distinction** | Loading vs empty vs error are visually/textually distinct. |
| R5 | **Cross-surface consistency** | CLI and Web enforce the same validation rules and use consistent wording. |
| R6 | **Affordances** | Keyboard support (Enter submits, Esc cancels), autofocus, disabled states, and empty states that say what to do next. |
| R7 | **Truthfulness** | Never report success for an operation that didn't take effect on disk. |

---

## 4. CLI Test Suite

Reset state (`rm -rf ~/.skills-ui ~/.agents`) before each journey unless a precondition says otherwise.

### 4.1 First run / empty states

**CLI-EMPTY-01 · `list` with nothing installed**
- Preconditions: fresh HOME, no skills.
- Steps: `skills-ui list`
- Expected: prints `No skills installed.`, exit 0.
- Usability/clarity: R4 — the empty message is distinct from an error; R6 — ideally hints how to add one.
- Status: pass (message present; the "what next" hint is a minor R6 gap).

**CLI-EMPTY-02 · `projects` with nothing registered**
- Steps: `skills-ui projects`
- Expected: prints `No projects registered. Use: skills-ui project add <path>`, exit 0.
- Usability/clarity: R4 + R6 — empty state *and* actionable next step. Good reference example.
- Status: pass.

### 4.2 Install a skill (`add`)

**CLI-ADD-01 · Install from a valid source**
- Steps: `skills-ui add <owner/repo>`
- Expected: prints `Installing <source>...` then `✓ Installed <source>`; skill appears under
  `~/.agents/skills/`; exit 0.
- Usability/clarity: R1 — progress line before the (up to 120s) call, success line after.
- Status: pass.

**CLI-ADD-02 · Install from a bad source**
- Steps: `skills-ui add this/does-not-exist`
- Expected: prints `Error: <message from skills>`, exit 1.
- Usability/clarity: R3 — message is the underlying CLI's stderr, forwarded verbatim; confirm it is
  legible (it depends on the `skills` binary's wording).
- Status: needs-manual (message quality depends on the upstream `skills` CLI).

**CLI-ADD-03 · `skills` binary missing**
- Preconditions: simulate by running against an install without the bundled binary.
- Expected: `Error: skills CLI not found. Try running: npm install`, exit 1.
- Usability/clarity: R3 — actionable remediation. Good reference example.
- Status: pass.

### 4.3 Browse & search (`list`)

**CLI-LIST-01 · List installed skills**
- Preconditions: ≥1 skill installed.
- Steps: `skills-ui list`
- Expected: one indented line per skill, `name  —  description` when a description exists.
- Usability/clarity: R4 — readable columns.
- Status: pass.

**CLI-LIST-02 · List filtered by project**
- Preconditions: a registered project with agents; ≥1 skill.
- Steps: `skills-ui list --project <absolutePath>`
- Expected: per skill, `  name  |  <agent>: enabled|disabled  |  ...` reflecting `state.json`.
- Usability/clarity: R7 — status shown matches on-disk symlink reality.
- Status: pass.

**CLI-LIST-03 · List filtered by an unregistered project**
- Steps: `skills-ui list --project /not/registered`
- Expected: `Project not found: /not/registered`, exit 1.
- Usability/clarity: R3 — clear, R5 — note this validates the project, unlike `enable`/`disable`
  (see CLI-ENABLE-03). The inconsistency itself is finding **F-CLI-02**.
- Status: pass (message) / FINDING F-CLI-02 (cross-surface inconsistency).

### 4.4 Register a project (`project add`)

**CLI-PROJ-01 · Register an existing absolute path**
- Steps: `skills-ui project add /abs/path/to/proj`
- Expected: `✓ Registered <name> (<path>)` + `Agents: <auto-detected>`; appears in `config.json`.
- Usability/clarity: R1 confirmation; agent auto-detection visible.
- Status: pass.

**CLI-PROJ-02 · Register with explicit `--agents`**
- Steps: `skills-ui project add /abs/path --agents claude-code,codex`
- Expected: registered with exactly those agents (trimmed).
- Usability/clarity: R1.
- Status: pass.

**CLI-PROJ-03 · Register a NON-EXISTENT path**
- Steps: `skills-ui project add /definitely/not/here`
- Expected (desired): a clear error that the path doesn't exist, exit 1.
- Actual (from code): the path is `resolve()`d and **registered anyway** with a `✓` — no validation.
- Usability/clarity: R7 (false success) + R5 (Web API rejects this) → finding **F-CLI-01**.
- Status: FINDING F-CLI-01.

**CLI-PROJ-04 · Register a RELATIVE path**
- Steps: from `/tmp`, `skills-ui project add ./proj`
- Expected: relative path is resolved against CWD; confirm the stored `path` is absolute and is the one
  the user intended.
- Usability/clarity: R5 — Web rejects relative paths outright; CLI silently resolves. Document the
  intended behavior; the divergence is part of F-CLI-01/F-CLI-02.
- Status: needs-manual / FINDING F-CLI-02.

**CLI-PROJ-05 · Re-register the same path (idempotency)**
- Steps: run CLI-PROJ-01 twice.
- Expected: second run returns the existing project, no duplicate in `config.json`.
- Usability/clarity: R7 — but note the second run still prints `✓ Registered` even though nothing was
  added; verify wording isn't misleading.
- Status: needs-manual (functional idempotency holds via `registerProject`; wording is a minor R1/R7 nit).

### 4.5 Enable / disable (`enable`, `disable`)

**CLI-ENABLE-01 · Enable a skill for a valid project+agent**
- Preconditions: skill installed; project registered with that agent; skill currently disabled.
- Steps: `skills-ui enable <skill> --project <path> --agent claude-code`
- Expected: `✓ Enabled ...`; symlink recreated at `<project>/.claude/skills/<skill>`; disabled entry
  removed from `state.json`.
- Usability/clarity: R7 — verify the symlink actually exists and resolves.
- Status: pass.

**CLI-ENABLE-02 · Disable a skill**
- Steps: `skills-ui disable <skill> --project <path> --agent claude-code`
- Expected: `✓ Disabled ...`; symlink removed; `state.json` records it disabled.
- Usability/clarity: R7.
- Status: pass.

**CLI-ENABLE-03 · Enable with an UNKNOWN agent**
- Steps: `skills-ui enable <skill> --project <path> --agent nonsense`
- Expected (desired): rejected — `nonsense` is not in `SUPPORTED_AGENTS`.
- Actual (from code): prints `✓ Enabled <skill> for nonsense ...`, writes a `state.json` entry under an
  agent that can never have a symlink dir (no `AGENT_DIRS['nonsense']`).
- Usability/clarity: R7 (false success) + R5 (Web API returns 400 for this) → finding **F-CLI-02**.
- Status: FINDING F-CLI-02.

**CLI-ENABLE-04 · Enable for an UNREGISTERED project**
- Steps: `skills-ui enable <skill> --project /not/registered --agent claude-code`
- Expected (desired): rejected — project isn't registered.
- Actual: succeeds and writes state for an unknown project path.
- Usability/clarity: R7 → finding **F-CLI-02** (shared with Web API, which also skips this check).
- Status: FINDING F-CLI-02.

**CLI-ENABLE-05 · Enable a skill that is NOT installed**
- Steps: `skills-ui enable ghost-skill --project <path> --agent claude-code`
- Expected (desired): rejected — no such skill in `~/.agents/skills/`.
- Actual: creates a **dangling symlink** pointing at a non-existent canonical dir.
- Usability/clarity: R7 → finding **F-CLI-03** (overlaps `DEBT-002`).
- Status: FINDING F-CLI-03.

### 4.6 Remove a skill (`remove`)

**CLI-REMOVE-01 · Remove an installed skill**
- Steps: `skills-ui remove <skill>`
- Expected: `✓ Removed <skill>`; gone from `~/.agents/skills/`; `state.json` disabled entries for it
  cleaned up (`cleanupSkill`).
- Usability/clarity: R1. Note: no confirmation prompt — acceptable for a CLI (explicit command) but
  compare with the Web one-click case WEB-SKILLS-03.
- Status: pass.

**CLI-REMOVE-02 · Remove a non-existent skill**
- Steps: `skills-ui remove ghost`
- Expected: `Error: <message>`, exit 1 (surfaced from the `skills` binary).
- Usability/clarity: R3.
- Status: needs-manual (message from upstream CLI).

### 4.7 Serve / edge

**CLI-SERVE-01 · Start on the default port**
- Steps: `skills-ui serve`
- Expected: `skills-ui running at http://localhost:3456`; UI reachable.
- Status: pass.

**CLI-SERVE-02 · Invalid `--port`**
- Steps: `skills-ui serve --port 99999` and `--port abc`
- Expected: `Error: invalid port "..." — must be an integer between 1 and 65535`, exit 1.
- Usability/clarity: R3 — precise, states the valid range. Good reference example.
- Status: pass.

**CLI-SERVE-03 · Serve before a web build exists**
- Preconditions: `dist/web/` absent.
- Steps: `skills-ui serve`, open the UI.
- Expected (desired): a clear message that the UI isn't built (run `npm run build`).
- Actual: the SPA fallback `sendFile(dist/web/index.html)` errors for a missing file.
- Usability/clarity: R3 → finding **F-WEB-08** (overlaps `UX-002`).
- Status: FINDING F-WEB-08.

---

## 5. Web UI Test Suite

Run against the built SPA via `serve` (see §2). Reset HOME between journeys as needed.

### 5.1 Dashboard (`/`)

**WEB-DASH-01 · Counts render**
- Preconditions: N skills, M projects.
- Steps: open `/`.
- Expected: "Installed skills" = N, "Registered projects" = M; "Manage Skills"/"Manage Projects" links
  navigate.
- Usability/clarity: R4.
- Status: pass.

**WEB-DASH-02 · Loading vs error indistinguishable**
- Preconditions: make `/api/skills` fail (e.g. stop the API / break the store).
- Steps: open `/`.
- Expected (desired): a distinct error indicator.
- Actual: both loading and error render `—`; the user can't tell a failure from a slow load.
- Usability/clarity: R4 → finding **F-WEB-05**.
- Status: FINDING F-WEB-05.

### 5.2 Skills list (`/skills`)

**WEB-SKILLS-01 · List + search filter**
- Preconditions: several skills with names/descriptions.
- Steps: open `/skills`; type in "Search skills...".
- Expected: list filters by name OR description (case-insensitive); non-matches hide.
- Usability/clarity: R4 — with matches shown; below covers the empty result.
- Status: pass.

**WEB-SKILLS-02 · Search with no matches**
- Steps: search for `zzzzz`.
- Expected: `No skills found` centered placeholder.
- Usability/clarity: R4 — distinct empty state.
- Status: pass.

**WEB-SKILLS-03 · Remove is one-click, no confirmation**
- Steps: click "Remove" on a skill.
- Expected (desired): a confirmation ("Remove <skill>? This uninstalls it for all projects.") before
  the destructive call.
- Actual: `removeMutation.mutate(...)` fires immediately; the skill is uninstalled with no prompt, no
  undo.
- Usability/clarity: R2 → finding **F-WEB-01**.
- Status: FINDING F-WEB-01.

**WEB-SKILLS-04 · Remove failure is silent**
- Preconditions: force `DELETE /api/skills/:name` to fail.
- Steps: click "Remove".
- Expected (desired): a visible error; the row stays.
- Actual: `removeMutation` has no `onError` — nothing is shown; the user can't tell it failed.
- Usability/clarity: R1 → finding **F-WEB-02**.
- Status: FINDING F-WEB-02.

### 5.3 Add Skill dialog

**WEB-ADD-01 · Install a valid source**
- Steps: "Add Skill" → type `owner/repo` → "Install".
- Expected: button shows "Installing..." and is disabled; on success the dialog closes and the list
  refreshes with the new skill.
- Usability/clarity: R1 (pending state), R6 (Install disabled while `source` empty).
- Status: pass.

**WEB-ADD-02 · Install error shows raw HTTP text**
- Steps: install a bad source; the API returns 422.
- Expected (desired): a friendly, actionable message.
- Actual: the dialog shows the raw `"<status> <statusText>: <body>"` string from `api.ts` `json()`.
- Usability/clarity: R3 → finding **F-WEB-03**.
- Status: FINDING F-WEB-03.

**WEB-ADD-03 · Keyboard affordances**
- Steps: open the dialog; press Enter in the field; press Esc.
- Expected (desired): Enter submits (when valid); Esc cancels; the field is autofocused on open.
- Actual: no keydown handling; the input is not autofocused; only mouse clicks work.
- Usability/clarity: R6 → finding **F-WEB-04**.
- Status: FINDING F-WEB-04.

### 5.4 Skill Detail (`/skills/:name`)

**WEB-SKILLDETAIL-01 · Status grid across projects**
- Preconditions: ≥1 registered project; the skill exists.
- Steps: open a skill from the list.
- Expected: name/description/source; a table of project rows × agent columns with a toggle per cell;
  toggles reflect `state.json`.
- Usability/clarity: R7 — toggle state matches disk.
- Status: pass.

**WEB-SKILLDETAIL-02 · No projects registered**
- Preconditions: zero projects.
- Steps: open a skill.
- Expected: `No projects registered. Add a project to manage this skill.`
- Usability/clarity: R4 + R6 — empty state with guidance. Good reference example.
- Status: pass.

**WEB-SKILLDETAIL-03 · Unknown skill renders a placeholder, not "not found"**
- Steps: navigate to `/skills/does-not-exist`.
- Expected (desired): a "skill not found" state.
- Actual: `GET /api/skills/:name` returns 200 with placeholder metadata (name = the slug, empty
  description), so the page renders as if the skill exists.
- Usability/clarity: R3/R7 → finding **F-WEB-06** (overlaps `UX-001`).
- Status: FINDING F-WEB-06.

### 5.5 Projects list (`/projects`)

**WEB-PROJ-01 · Register a valid absolute path**
- Steps: "Add Project" → type an existing absolute path → "Add".
- Expected: button shows "Adding..." then the form closes and the project appears (name, path, agents).
- Usability/clarity: R1, R6 (Add disabled while empty/pending).
- Status: pass.

**WEB-PROJ-02 · Register an invalid path — silent failure**
- Steps: enter a relative or non-existent path → "Add".
- Expected (desired): a visible validation error ("path must be absolute" / "path does not exist"); the
  server already returns 400 with these messages.
- Actual: `addMutation` has no `onError`; the form just stays open with the typed value and no message —
  the user thinks nothing happened.
- Usability/clarity: R1 + R3 → finding **F-WEB-02** (the 400 body is never surfaced).
- Status: FINDING F-WEB-02.

**WEB-PROJ-03 · Remove a project — one-click, no confirmation, silent failure**
- Steps: click "Remove" on a project.
- Expected (desired): confirmation before unregistering; visible error if it fails.
- Actual: fires `unregisterProject` immediately (R2 → **F-WEB-01**); no `onError` (R1 → **F-WEB-02**).
- Status: FINDING F-WEB-01, F-WEB-02.

**WEB-PROJ-04 · Empty state**
- Preconditions: no projects.
- Steps: open `/projects`.
- Expected: `No projects registered` placeholder.
- Usability/clarity: R4.
- Status: pass.

### 5.6 Project Detail (`/projects/:projectPath`) & bulk actions

**WEB-PROJDETAIL-01 · Skill matrix + per-cell toggle**
- Preconditions: registered project with agents; ≥1 installed skill.
- Steps: open a project; toggle a cell.
- Expected: rows = skills, columns = agents; toggling flips enabled/disabled, calls the API, and
  refetches so the switch reflects the new truth.
- Usability/clarity: R7 (toggle = disk truth), R1 (switch disabled while pending).
- Status: pass.

**WEB-PROJDETAIL-02 · Toggle failure is silent**
- Preconditions: force enable/disable to fail.
- Steps: click a toggle.
- Expected (desired): a visible error; switch returns to its true state.
- Actual: `AgentToggle` has no `onError`; on failure it silently snaps back after invalidation with no
  message — looks like the click was ignored.
- Usability/clarity: R1 → finding **F-WEB-07**.
- Status: FINDING F-WEB-07.

**WEB-PROJDETAIL-03 · "Enable all" / "Disable all" — no progress or partial-failure feedback**
- Steps: click "Enable all" on a project with many skills×agents.
- Expected (desired): a busy/progress indication; if some calls fail, the user is told which.
- Actual: fans out N×M parallel requests with no pending UI; on partial failure the grid just refetches
  and some cells silently stay unchanged.
- Usability/clarity: R1 → finding **F-WEB-09**.
- Status: FINDING F-WEB-09.

**WEB-PROJDETAIL-04 · No skills installed globally**
- Preconditions: zero installed skills.
- Steps: open a project.
- Expected: `No skills installed globally.` placeholder.
- Usability/clarity: R4.
- Status: pass.

### 5.7 Navigation / shell

**WEB-NAV-01 · Sidebar active state & routing**
- Steps: click Dashboard / Skills / Projects.
- Expected: the active item is highlighted; routes render; deep links (`/skills/:name`,
  `/projects/:projectPath`) load directly (SPA fallback serves index.html).
- Usability/clarity: R4.
- Status: pass.

---

## 6. Findings — UX Gap Register

Discovered while designing the cases above. Each cites the exact code location so it can be confirmed by
reading the source. **Doc-only:** these are recorded, not fixed. They can be mirrored into
`.DEVELOPMENT/ISSUES.md` as `UX-###` on request.

### CLI

| ID | Severity | Rubric | Where | Summary | Exposed by |
|----|----------|--------|-------|---------|-----------|
| F-CLI-01 | medium | R5, R7 | `src/cli/commands/project-add.ts` | `project add` never checks the path exists; it `resolve()`s and registers anything, printing `✓`. The Web API (`src/server/routes/projects.ts`) rejects relative/non-existent paths — so the two surfaces disagree. | CLI-PROJ-03/04 |
| F-CLI-02 | medium | R5, R7 | `src/cli/commands/enable.ts`, `disable.ts` | `enable`/`disable` accept any `--agent` (bypass `SUPPORTED_AGENTS`) and any unregistered `--project`, then print `✓` — false success. Web API validates the agent (400) but *also* skips the project-registration check. | CLI-ENABLE-03/04, CLI-LIST-03 |
| F-CLI-03 | low | R7 | `src/core/state.ts` → `enable()` | Enabling an uninstalled skill creates a dangling symlink to a non-existent canonical dir (no existence check). Overlaps `DEBT-002`. | CLI-ENABLE-05 |

### Web UI

| ID | Severity | Rubric | Where | Summary | Exposed by |
|----|----------|--------|-------|---------|-----------|
| F-WEB-01 | high | R2 | `src/web/pages/Skills.tsx`, `Projects.tsx` | Destructive "Remove" fires on a single click — no confirmation, no undo — for both skills and projects. | WEB-SKILLS-03, WEB-PROJ-03 |
| F-WEB-02 | high | R1, R3 | `Skills.tsx`, `Projects.tsx` | Mutations lack `onError`: failed skill-remove, project-remove, and **project-add** show nothing. Adding an invalid path returns 400 but the form silently stays open. | WEB-SKILLS-04, WEB-PROJ-02/03 |
| F-WEB-03 | medium | R3 | `src/web/api.ts` `json()` → `AddSkillDialog.tsx` | Install errors surface the raw `"<status> <statusText>: <body>"` string instead of a friendly message. | WEB-ADD-02 |
| F-WEB-04 | medium | R6 | `AddSkillDialog.tsx`, `Projects.tsx` add form | Dialogs don't submit on Enter, don't close on Esc, and don't autofocus the input. | WEB-ADD-03 |
| F-WEB-05 | low | R4 | `src/web/pages/Dashboard.tsx` | Loading and error both render `—`; no distinct error state. | WEB-DASH-02 |
| F-WEB-06 | low | R3, R7 | `src/web/pages/SkillDetail.tsx` (+ `metadata.ts`) | Unknown skill renders a 200 placeholder instead of a not-found state. Overlaps `UX-001`. | WEB-SKILLDETAIL-03 |
| F-WEB-07 | medium | R1 | `src/web/components/AgentToggle.tsx` | Toggle has no `onError`; on failure the switch silently reverts with no message — looks like the click was ignored. | WEB-PROJDETAIL-02 |
| F-WEB-08 | low | R3 | `src/server/index.ts` (`app.get('*')`) | Serving before a web build errors on `sendFile` of a missing `index.html` instead of guiding the user to `npm run build`. Overlaps `UX-002`. | CLI-SERVE-03 |
| F-WEB-09 | medium | R1 | `src/web/pages/ProjectDetail.tsx` | Bulk "Enable all"/"Disable all" gives no progress and no partial-failure feedback; fans out N×M parallel requests. | WEB-PROJDETAIL-03 |

**Reference examples of *good* interaction** (keep as the bar to hold other flows to): CLI-EMPTY-02,
CLI-ADD-03, CLI-SERVE-02, WEB-SKILLDETAIL-02.

---

## 7. Coverage & Traceability Matrix

### Journey × surface

| Journey | CLI cases | Web cases |
|---------|-----------|-----------|
| First run / empty states | CLI-EMPTY-01/02 | WEB-SKILLS-02, WEB-PROJ-04, WEB-SKILLDETAIL-02, WEB-PROJDETAIL-04 |
| Install a skill | CLI-ADD-01/02/03 | WEB-ADD-01/02/03 |
| Browse & search | CLI-LIST-01 | WEB-SKILLS-01/02 |
| Register a project | CLI-PROJ-01..05 | WEB-PROJ-01/02 |
| View project matrix | CLI-LIST-02/03 | WEB-PROJDETAIL-01/04 |
| Enable/disable | CLI-ENABLE-01..05 | WEB-PROJDETAIL-01/02, WEB-SKILLDETAIL-01 |
| Bulk enable/disable | — (Web-only feature) | WEB-PROJDETAIL-03 |
| Skill detail across projects | — | WEB-SKILLDETAIL-01/02/03 |
| Remove a skill (destructive) | CLI-REMOVE-01/02 | WEB-SKILLS-03/04 |
| Unregister a project (destructive) | — (no CLI command) | WEB-PROJ-03 |
| Serve / shell / edge | CLI-SERVE-01/02/03 | WEB-DASH-01/02, WEB-NAV-01 |

### Case → code surface

- **CLI commands** (`src/cli/commands/`): `add`→CLI-ADD-*, `remove`→CLI-REMOVE-*, `list`→CLI-LIST-*,
  `enable`/`disable`→CLI-ENABLE-*, `projects`→CLI-EMPTY-02, `project add`→CLI-PROJ-*, `serve`→CLI-SERVE-*.
- **API routes** (`src/server/routes/`): `/api/skills`→WEB-SKILLS-*/WEB-ADD-*, `/api/skills/:name`→
  WEB-SKILLDETAIL-*, `/enable`+`/disable`→WEB-PROJDETAIL-*/WEB-SKILLDETAIL-01, `/api/projects`→WEB-PROJ-*,
  `/api/projects/:path`→WEB-PROJDETAIL-*, `/api/agents`→(exercised implicitly via agent columns).
- **Web components** (`src/web/`): `Layout`→WEB-NAV-01, `Dashboard`→WEB-DASH-*, `Skills`→WEB-SKILLS-*,
  `AddSkillDialog`→WEB-ADD-*, `SkillDetail`→WEB-SKILLDETAIL-*, `Projects`→WEB-PROJ-*, `ProjectDetail`→
  WEB-PROJDETAIL-*, `AgentToggle`→WEB-PROJDETAIL-02/WEB-SKILLDETAIL-01.

### Coverage gaps to note

- **No CLI "unregister project"** command exists — the only way to remove a project is the Web UI or
  editing `config.json`. Worth flagging as a functional gap (R5: Web has it, CLI doesn't).
- `PATCH /api/projects/:path` (rename / change agents) has **no Web UI** entry point today, so it has no
  interaction case — only the existing Supertest unit test covers it. Flag for future UI work.

---

## 8. How to Use This Document

1. Stand up an isolated instance per §2 (Docker for CLI, throwaway `HOME` + `serve` for Web) — or run
   the automated suite (§9), which implements these cases.
2. Walk each case; record `pass` / `fail` and attach the actual output or a screenshot.
3. For any `FINDING` case, confirm the cited code path and file the gap (§6 is mirrored into
   `.DEVELOPMENT/ISSUES.md` as `UX-###`/`BUG-###`).
4. Re-run after fixes; a finding is closed only when its case meets the usability/clarity criterion,
   not merely when the function works.

---

## 9. Automation (Playwright E2E — Docker-only)

The cases above are implemented as an automated suite under [`e2e/`](../../e2e/README.md). Full
run instructions, the hard isolation contract (host needs Docker only — never Node), and the layout
live in `e2e/README.md`; this section records how automation maps back to this document.

### Architecture

- **Runtime**: `Dockerfile.e2e` (official Playwright image; Node + Chromium in image layers). Specs run
  against the **real built product** — `dist/cli/index.js` and the real Express server spawning the
  real bundled `skills` binary. Nothing is mocked.
- **Isolation**: one server per Playwright worker with a unique in-container `$HOME`
  (`/tmp/skills-ui-e2e/home-<workerIndex>`); every test starts from a wiped store. CLI cases spawn the
  binary as a fresh process with the injected `$HOME` — identical to a real user shell.
- **Tiers**: offline tier (default) uses hand-crafted fixtures (`e2e/fixtures/skills/`) and real local
  installs (`e2e/fixtures/repos/` via `skills add <path>`); the `@network` tier (opt-in,
  `--network`) exercises the real GitHub sources from the plan.
- **Case mapping**: spec titles carry the case IDs from §4/§5 (`CLI-ADD-01`, `WEB-PROJ-03`, …).
  Automation-added scenarios use `SCEN-*` (store shapes, install methods, post-install edits,
  version-over-install, dangling links) and `NET-*` (real sources) IDs.
- **Findings discipline**: every registered finding appears as a `test.fixme` asserting the *desired*
  behavior (skipped-but-listed; flips to a real test when fixed), and high-value cases also get a
  **truth-pin** test asserting today's *broken* behavior so silent changes are caught.

### New findings discovered by the automation pass

- **BUG-001 (high)** — `listSkills()` in `src/core/skills-cli.ts` cannot parse the bundled
  `skills@1.4.5` output: the binary hardcodes ANSI colors even when piped (`NO_COLOR` ignored), emits a
  `Global Skills` header, `name  ~/.agents/skills/name` lines, and `Agents: …` detail lines, and its
  empty-store message (`No global skills found.`) misses the `"no skills"` filter — so an **empty store
  parses as 2 phantom skills** and every listed name is ANSI-mangled. Blast radius: `skills-ui list`,
  `GET /api/skills`, Dashboard counts, Skills page rows, project matrix keys, `list --project` status
  truth. Several §4/§5 cases marked `pass` at design time are actually broken by this (CLI-EMPTY-01,
  CLI-LIST-01 strict, CLI-LIST-02, WEB-DASH-01 zero-state, WEB-PROJDETAIL-04) — their automated
  versions are fixme'd under BUG-001. Registered in `.DEVELOPMENT/ISSUES.md`.
- **Listing truth ≠ disk truth** — `skills list -g` silently omits skills whose frontmatter lacks a
  `description` (or is unparsable), while `GET /api/skills/:name` reads them from disk fine.
- **`skills-ui add` cannot pass `--skill`** — selecting one skill from a multi-skill repo
  (e.g. `anthropics/skills --skill pptx`) is impossible through skills-ui; only the bundled binary can.
  Functional gap for R5 consistency (the underlying CLI supports it; the wrapper hides it).

### Traceability delta

All §4/§5 cases are automated except: CLI-ADD-03 (`skills` binary missing — requires deleting the
binary from the image; covered by unit tests), CLI-SERVE-01/03 (long-running serve; CLI-SERVE-03's
missing-build state can't exist in the image, which always builds), WEB-ADD-03's Enter-submit half
(fixme'd with Esc/autofocus under UX-007). The §7 coverage gaps stand: no CLI unregister command;
`PATCH /api/projects` has no UI (its API contract is now automated in `e2e/specs/api/contracts.spec.ts`).
