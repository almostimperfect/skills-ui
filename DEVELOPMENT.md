# Development

Status snapshot: 2026-05-07

## Requirements

- Node.js 18+

## Setup

```bash
git clone https://github.com/your-org/skills-ui
cd skills-ui
npm install
```

## Commands

```bash
npm test             # run all tests
npm run build        # compile server TS + bundle web

npm run dev:server   # backend on http://localhost:3456
npm run dev:web      # Vite dev server on http://localhost:5173
```

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 18, TypeScript (ESM), Express 4 |
| Frontend | React 19, Vite 6, Tailwind CSS 3, TanStack Query 5, React Router 7 |
| Testing | Vitest 2 + Supertest |

## R&D Direction

Product-facing design notes live in [docs/PRODUCT_DESIGN.md](./docs/PRODUCT_DESIGN.md), and the lightweight prioritized backlog lives in [docs/TODOLIST.md](./docs/TODOLIST.md).

The project is a local asset manager that remains compatible with `skills` without delegating all state to that CLI.

The current direction is:

- Reuse the `skills` / `skills.sh` ecosystem for source compatibility, lock metadata, and fallback handling.
- Discover installed instances from managed filesystem paths first, then merge `skills list --json` output as compatibility data.
- Install and remove local/archive-backed assets by writing the concrete target directories without writing upstream `skills` locks by default.
- Install, remove, and update remote CLI-managed assets through `skills` so the CLI maintains its own lock metadata.
- Let `skills-ui` own metadata, inventory, reconciliation, and higher-level management workflows.
- Manage a concrete machine-level scope:
  - global skills from managed global skill directories plus `skills list -g --json`
  - project skills from registered project skill directories plus per-project `skills list --json`
- Keep "skill exists" separate from "skill is currently installed anywhere".

This is the central product idea:

- `inventory` remembers what this machine knows about.
- direct directory copy/remove is the primitive install/uninstall mechanism for local/archive-backed assets.
- `skills add/remove/update` are the primary adapters for remote CLI-managed assets and fallback adapters when a source or target cannot be resolved directly.
- project enable/disable means project-local add/remove, not manual link mutation.
- source-less skills are archived immediately so later external deletions do not corrupt metadata.

## Current Design

### 1. Discovery

Discovery is adapter-based and filesystem-first.

- global discovery scans known global skill dirs for managed agents, then merges `skills list -g --json`
- project discovery scans registered project skill dirs for enabled agents, then merges `skills list --json` with project `cwd`
- duplicate reports are merged by scope, path, and project
- one broken project or CLI failure is skipped for that adapter pass instead of failing the whole catalog

Relevant files:

- [src/core/skills-cli.ts](./src/core/skills-cli.ts)
- [src/core/inventory.ts](./src/core/inventory.ts)

This keeps manual filesystem edits and `skills` CLI edits compatible while letting `skills-ui` maintain its own asset model.

### 2. Project Registry

Managed scope is defined by registered projects stored in:

- `~/.skills-ui/config.json`

Relevant file:

- [src/core/projects.ts](./src/core/projects.ts)

Projects store:

- absolute path
- display name
- managed agents

Agent IDs are normalized, for example `gemini` becomes `gemini-cli`.

The same config also stores optional global enabled agents. Global install actions pass these agents to `skills add -g --agent ...` so `skills-ui` does not rely on upstream CLI default targets.

### 3. Inventory and Archive

Machine-level skill catalog is stored in:

- `~/.skills-ui/inventory.json`
- `~/.skills-ui/archive/`

Relevant file:

- [src/core/inventory.ts](./src/core/inventory.ts)

Important rules:

- inventory entries use a stable `id`, not just `name`
- `id` is derived from `name + current skill content hash` when live/archive content is readable
- `name + sourceType + sourceRef` remains the fallback identity
- this prevents cross-source name collisions in the UI/API
- same-content global and project installs reconcile into one asset
- inventory entries remain even if all live instances disappear
- source-less skills are archived immediately on discovery
- archive copies are keyed by name plus path hash to avoid collisions

### 4. Status Model

Per-project skill state is now structured instead of boolean:

- `project`
- `global`
- `available`
- `unavailable`

Relevant file:

- [src/core/status.ts](./src/core/status.ts)

This model also encodes:

- whether enable is allowed
- whether disable is allowed
- explanatory reason text
- shared action groups for universal project dirs such as `.agents/skills`

### 5. Maintenance Model

Maintenance is separate from install status.

Relevant file:

- [src/core/maintenance.ts](./src/core/maintenance.ts)

Current maintenance checks:

- global update status for supported GitHub-backed global skills
- project drift detection by comparing live folder hash with `skills-lock.json`

Reported update states:

- `up-to-date`
- `update-available`
- `unsupported`
- `error`

### 6. Operations

Current semantics:

- add global skill:
  - direct copy to configured global agent dirs when source is local/archive-backed
  - use `skills add ... -g --agent <enabled-agent>` for remote or unresolved sources
- remove global skill:
  - delete discovered global instance directories for local/archive/manual assets
  - use `skills remove <name> -g` for CLI-managed remote assets or unresolved targets
- enable for project:
  - direct copy to the project agent directory for local/archive-backed assets without writing `skills-lock.json`
  - use project-local `skills add --skill <name>` for CLI-managed remote assets or unresolved sources
- disable for project:
  - delete the project agent directory for local/archive/manual assets without mutating `skills-lock.json`
  - use project-local `skills remove` for CLI-managed remote assets or unresolved targets
- split global:
  - install project-local copies into registered projects that currently inherit the skill
  - remove the global instance afterward
- update global:
  - use `skills` for remote sources and direct copy/archive metadata for local sources

The code path for most of this now runs through:

- [src/server/routes/skills.ts](./src/server/routes/skills.ts)
- [src/core/inventory.ts](./src/core/inventory.ts)

## Current Completion Level

Implemented:

- JSON-based discovery
- registered-project discovery scope
- immediate archive of source-less skills
- stable catalog IDs
- structured per-project skill state
- global inherited state handling
- split-global migration
- maintenance API
- global update action
- drift detection for project-local copies
- CLI support for `check`, `update`, `split-global`
- React UI for maintenance and split-global
- removal of the old `state.ts` model

Validation status:

- `npm run build:server` passes
- `npm run build:web` passes
- `npm test` passes

As of 2026-05-07:

- 10 test files
- 61 tests passing

## File Map

Current key files:

- [src/core/skills-cli.ts](./src/core/skills-cli.ts): wrapper around bundled `skills`
- [src/core/agents.ts](./src/core/agents.ts): agent normalization and path inference
- [src/core/projects.ts](./src/core/projects.ts): project registry
- [src/core/inventory.ts](./src/core/inventory.ts): inventory, archive, reconcile, high-level operations
- [src/core/status.ts](./src/core/status.ts): per-project skill state derivation
- [src/core/maintenance.ts](./src/core/maintenance.ts): update/drift checks
- [src/core/skills-lock.ts](./src/core/skills-lock.ts): global/project lock readers
- [src/server/routes/skills.ts](./src/server/routes/skills.ts): skills API
- [src/server/routes/projects.ts](./src/server/routes/projects.ts): projects API
- [src/web/pages/SkillDetail.tsx](./src/web/pages/SkillDetail.tsx): maintenance and split-global UI
- [src/web/pages/ProjectDetail.tsx](./src/web/pages/ProjectDetail.tsx): project matrix UI

## Known Boundaries And Remaining Problems

These are design boundaries, not unimplemented bugs.

### Project remote update checks are intentionally limited

Global GitHub skills can be checked for updates because `.skill-lock.json` records:

- `source`
- `sourceUrl`
- `skillPath`
- `skillFolderHash`

Project `skills-lock.json` does not record enough information to reproduce that check reliably.

It only records:

- `source`
- `sourceType`
- `computedHash`

So for project skills, the system currently supports:

- reinstall from known source
- drift detection

But not reliable remote version checking.

### Direct `skills` CLI usage outside `skills-ui`

This is supported operationally, but not as a transactional source of truth.

Safe assumption:

- users may run `skills add/remove/update`
- users may manually edit or delete skill folders

Current mitigation:

- next reconcile reads the real filesystem and CLI state again
- source-less skills are archived early
- catalog entries are preserved even when instances disappear

Remaining reality:

- UI may be stale until next refresh/reconcile
- user actions outside registered projects are intentionally out of scope

### Split-global scope is limited to registered projects

`split-global` only migrates:

- projects listed in `config.json`

Unregistered projects are not touched. This is deliberate because `skills-ui` only manages declared scope.

### Same-name skills are only isolated inside `skills-ui`

The catalog now supports same-name entries from different sources using stable IDs.

But upstream `skills` still installs by folder name. That means two different skills with the exact same install folder name cannot coexist in the same underlying scope if upstream itself would collide.

### No background scheduler

There is currently no daemon/background worker for:

- periodic reconcile
- periodic update checks
- notifications

Everything is on-demand via API/CLI/UI refresh.

## Next Ideas

Good follow-up directions:

- expose maintenance summary on the top-level skills list page
- add project settings UI for editing managed agents and project metadata
- add explicit reconcile endpoint / CLI command
- add "reinstall project skill" action for drift recovery
- surface more precise source labels in UI:
  - github
  - well-known
  - archive
  - local
- record more provenance for project installs if upstream `skills` expands local lock metadata in future versions
- add optional background refresh/update notifications if the product grows beyond manual admin workflows

## Historical Note

The old design used:

- `state.json`
- direct symlink enable/disable logic

That model has been removed. The current system should treat:

- inventory
- reconcile
- `skills add/remove`
- lock-file-backed metadata

as the real architecture going forward.
