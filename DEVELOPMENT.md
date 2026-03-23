# Development

Status snapshot: 2026-03-23

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

The project no longer tries to be a custom symlink manager sitting beside `skills`.

The current direction is:

- Reuse the `skills` / `skills.sh` ecosystem for discovery, installation, removal, lock files, and agent integration.
- Let `skills-ui` own metadata, inventory, reconciliation, and higher-level management workflows.
- Manage a concrete machine-level scope:
  - global skills from `skills list -g --json`
  - project skills from every registered project via `skills list --json`
- Keep "skill exists" separate from "skill is currently installed anywhere".

This is the central product idea:

- `inventory` remembers what this machine knows about.
- `skills add/remove` remain the primitive install/uninstall mechanism.
- project enable/disable means project-local add/remove, not manual link mutation.
- source-less skills are archived immediately so later external deletions do not corrupt metadata.

## Current Design

### 1. Discovery

All discovery goes through the bundled `skills` CLI.

- global discovery: `skills list -g --json`
- project discovery: `skills list --json` with project `cwd`

Relevant files:

- [src/core/skills-cli.ts](./src/core/skills-cli.ts)
- [src/core/inventory.ts](./src/core/inventory.ts)

This avoids hardcoding directory scanning rules that may drift from upstream `skills`.

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

### 3. Inventory and Archive

Machine-level skill catalog is stored in:

- `~/.skills-ui/inventory.json`
- `~/.skills-ui/archive/`

Relevant file:

- [src/core/inventory.ts](./src/core/inventory.ts)

Important rules:

- inventory entries use a stable `id`, not just `name`
- `id` is derived from `name + sourceType + sourceRef`
- this prevents cross-source name collisions in the UI/API
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
  - `skills add ... -g`
- remove global skill:
  - `skills remove <name> -g`
- enable for project:
  - project-local `skills add`
- disable for project:
  - project-local `skills remove`
- split global:
  - install project-local copies into registered projects that currently inherit the skill
  - remove the global instance afterward
- update global:
  - reinstall the managed global skill from recorded source

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

As of 2026-03-23:

- 10 test files
- 43 tests passing

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
