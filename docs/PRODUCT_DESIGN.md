# Product Design

Status snapshot: 2026-05-06

## Product Goal

`skills-ui` is a local asset manager for agent skills.

It should not be only an installed-skill viewer. Its main job is to help a user maintain a durable machine-level skill catalog, understand where each skill is installed, and move skills between global and project scopes without losing provenance.

## Core Product Model

### Skill Asset

A skill asset is something `skills-ui` knows about and can manage.

An asset may come from:

- global skills discovered through `skills list -g --json`
- project skills discovered from registered projects through `skills list --json`
- a GitHub or local source installed through `skills`
- an archived copy created by `skills-ui`
- a catalog entry that no longer has installed instances

Important rule: a skill remains an asset even when it is not installed anywhere.

### Installation Instance

An installation instance is where an asset currently exists:

- global
- project-local
- project plus agent visibility, such as Codex, Gemini CLI, Claude Code, or Antigravity

Removing an instance is not the same as deleting the asset.

Installation has two independent dimensions:

- scope: global or project-local
- enabled AI tools: the specific agents that should see the skill

Global install actions must use the configured global enabled agents instead of relying on upstream CLI defaults. Project install actions must use the target project's enabled agents. Shared directories, such as `.agents/skills`, should be represented as a combined managed group instead of showing disabled tools that the user did not choose to manage.

### Source And Provenance

Each asset should keep enough provenance to support future actions:

- original source label
- reinstall source
- source type, such as GitHub, local, archive, or unknown
- archived path when applicable
- installed paths
- known lock/hash metadata

When source metadata is missing or unreliable, `skills-ui` should archive the live skill folder early.

## Required Asset Actions

The product should support these actions as separate concepts:

- add a new asset from source and optionally install it globally
- install an existing asset to global scope
- install an existing asset to a registered project
- install a project-discovered asset into another registered project
- promote a project-local asset to global scope
- uninstall an asset from one project or one global scope
- delete an asset from the `skills-ui` catalog when the user explicitly wants to forget it
- restore or reinstall from the recorded source/archive
- inspect update and drift state

Current implementation already supports some of this, but the UI still presents many actions as global-first installation management.

## Compatibility With `skills`

`skills-ui` should treat the upstream `skills` CLI as an important compatibility adapter, not as the only source of truth for installed-instance discovery or install/uninstall operations.

The CLI is not the whole product model. The durable product model belongs to `skills-ui`: assets, provenance, archived copies, registered projects, status, conflicts, and user-facing workflows.

Discovery rules:

- first scan known global and project skill directories for managed agents
- then merge `skills list -g --json` and per-project `skills list --json` output as compatibility data
- reconcile duplicate reports by installed path and project scope

Operation rules:

- local/archive-backed assets should be installed by copying the skill folder into selected target directories
- local/archive/manual installs should not write upstream `skills` lock files by default; `skills-ui` records its own metadata and archives instead
- remote sources should use `skills add` so the upstream CLI writes and maintains its own lock metadata
- CLI-managed remote assets copied to another project should be installed from the original remote source through `skills add --skill`
- uninstall for local/archive/manual instances should remove the concrete target directories represented in the asset model
- uninstall for CLI-managed remote instances should use `skills remove` so the upstream lock remains coherent

External changes are allowed:

- users may run `skills add/remove/update` outside `skills-ui`
- users may manually edit or delete skill folders
- users may maintain skills directly without going through `skills-ui`
- the next reconcile should update installed instances from reality
- known assets should not disappear just because their instances disappeared

Manual maintenance principle:

- if a user manually changes skills, `skills-ui` should still be able to manage whatever can be discovered or archived
- when `skills-ui` lacks enough source metadata, it should preserve what it can and clearly mark limitations
- the product should avoid assuming exclusive ownership of the filesystem
- filesystem reality wins during reconcile; CLI output is merged, but should not override installed paths that are directly visible

Failure rule:

- one broken registered project should not prevent the full skills catalog from loading
- broken projects should be surfaced as project-level errors and skipped for that reconcile pass

## Project Registry

Registered projects define the managed project scope.

`skills-ui` should not scan the whole filesystem for projects by default. It should only manage projects that the user registers or imports.

Each project should track:

- absolute path
- display name
- managed agents
- last reconcile status
- last error, if discovery failed

The machine also has a global enabled-agent set. It controls which AI tools receive global installs. When unset, it can be inferred from registered projects; users can then adjust it explicitly.

## Asset States

Suggested user-facing states:

- `installed globally`: has at least one global instance
- `installed in projects`: has project-local instances
- `available`: known and reinstallable, but not installed in the selected target
- `catalog only`: known asset with no installed instances
- `source missing`: asset exists but cannot be safely reinstalled
- `modified`: project-local copy differs from lock/hash metadata
- `conflict`: same display name maps to multiple asset identities

These states should be shown as asset state, not just as per-row badges.

## Version And Conflict Rules

Skill names are not enough to identify assets.

The asset identity should continue to use a stable id based on:

- skill name
- current skill content hash when the live or archived folder is available
- source type and source reference as a fallback

Future version-aware identity may also need:

- upstream revision or version
- lock hash
- archive hash
- source subpath

Known limitation: upstream `skills` installs by folder name, so two different skills with the same folder name cannot coexist in the same underlying scope if the CLI itself would collide.

The UI should make this visible instead of hiding it:

- same-name assets should display source labels
- ambiguous actions should require choosing a specific catalog id
- conflicts should explain which source or scope owns each installed instance

## Primary Screens

### Dashboard

The dashboard should summarize asset health:

- total known assets
- globally installed assets
- project-installed assets
- catalog-only assets
- modified project copies
- broken registered projects

### Skills

The skills page should be an asset catalog.

Each row should show:

- name and source label
- asset state
- global/project install counts
- maintenance state
- primary next action

Rows should not be dominated by long descriptions. Descriptions can be secondary or truncated.

### Skill Detail

The detail page should show:

- provenance and reinstall source
- all installed instances
- target install actions
- update/drift status
- conflicts or same-name variants
- delete asset action when safe

### Projects

The projects page should show:

- registered projects
- managed agents
- last reconcile status
- project discovery errors

### Project Detail

The project detail page should answer:

- which assets are installed here
- which assets are inherited globally
- which known assets can be installed here
- which project-local skills are modified

## Current Product Gaps

Highest-priority gaps:

- skills page is still closer to an installation list than an asset catalog
- installing an asset into a specific target project still needs a clearer detail-page workflow
- global remove and project remove are destructive without confirmation
- catalog-only assets cannot be explicitly deleted
- broken registered projects are skipped during reconcile but are not yet surfaced clearly in the UI
- project add errors are not shown in the UI
- mobile layout has a basic responsive structure, but tables and dense detail pages still need a full pass

## Design Priorities

1. Make asset versus installation semantics clear.
2. Keep `skills` CLI compatibility while allowing direct folder management for local/archive/manual assets.
3. Make external CLI changes recoverable through reconcile.
4. Add safe actions for install, uninstall, promote, and delete.
5. Surface project errors without blocking the whole catalog.
6. Improve UI density and responsive behavior after the product model is clear.
