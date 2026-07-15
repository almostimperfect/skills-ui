# Desktop Product Remediation Design v1.0

**Status:** Proposed from the accepted desktop product audit

**Source:** `docs/audits/product-experience-acceptance-v1.1/report-v1.1.md`

**Target branch:** `development`

## Goal

Turn the existing desktop administration UI into a coherent, safe workflow for managing local Skill assets and their global/project installation instances. The release must preserve the current filesystem-first architecture and `skills` CLI compatibility while fixing the broken task continuity, destructive-action ambiguity, target-install dead end, weak first-run guidance, and unsafe error presentation found in the audit.

## User Outcome

A desktop user can:

1. See whether the local Skill inventory needs attention.
2. Understand the difference between a known Skill and an installed instance.
3. Install a known Skill globally or into a selected registered project without losing context.
4. Remove a project/global instance only after seeing the affected scope.
5. Stay on a valid canonical detail page when content reconciliation changes a catalog ID.
6. Recover a modified project copy from the recorded source.
7. Understand first-run setup and errors without seeing raw host commands or sensitive local paths.

## Constraints

- Desktop web UI only; phone and tablet layouts are not acceptance targets for this release.
- Preserve direct filesystem operations for local/archive/manual Skills.
- Preserve `skills` CLI operations for remote CLI-managed Skills.
- Do not scan the entire machine for projects; only registered projects are managed.
- Do not add a background daemon or scheduler.
- Do not add a new frontend framework or component library.
- Do not expose the real home directory, full CLI command lines, tokens, or host-specific paths in user-facing errors or committed fixtures.
- Existing inventory files must remain readable without a manual migration command.

## Approaches Considered

### A. Incremental domain hardening — selected

Keep the inventory, routes, React Query, and current page structure. Add catalog-ID aliases, explicit action components, a targeted installation panel, an overview endpoint, safe error mapping, and guided empty states.

Benefits: fixes root causes, keeps compatibility, limits migration risk, and can be delivered through focused tests and commits.

Trade-off: some existing page files remain large; this release only extracts components where interaction safety benefits.

### B. Frontend-only patch

Add confirmation dialogs, copy changes, and client-side redirects without changing inventory or APIs.

Rejected because it cannot reliably resolve a changed catalog ID, report reconciliation health, forget catalog-only assets, or sanitize backend failures at the correct boundary.

### C. Full catalog model rewrite

Replace content-derived IDs with a new UUID-backed database and rebuild asset/version/instance storage.

Rejected for this release because migration and compatibility risk are disproportionate. Alias continuity provides the required user outcome without replacing the storage model.

## Product Model

The UI will use these terms consistently:

- **Skill:** the durable catalog asset known to `skills-ui`.
- **Installation:** one global or project-local filesystem instance.
- **Global targets:** the enabled AI tools that receive global installations.
- **Project agents:** the AI tools managed for a registered project.

Navigation remains `Skills`, and page headings use `Skills`. `Asset` remains an explanatory domain term in supporting copy, not a competing primary label.

## Architecture

### 1. Catalog continuity

`InventorySkill` gains optional `aliases: string[]`.

When reconciliation computes a new canonical ID for an existing instance, the previous ID and its aliases are copied into the resolved Skill. When a preserved catalog-only Skill is re-keyed, its prior ID is also retained as an alias. Alias lists are deduplicated and never contain the current canonical ID.

`resolveSkillRef(ref)` resolves in this order:

1. canonical ID;
2. alias;
3. unique Skill name.

The Skill API returns the canonical `id`. `SkillDetail` compares the route parameter with the returned ID and replaces the URL when they differ. Mutation success also invalidates the current query; alias resolution keeps the old request valid until the canonical redirect completes.

This preserves content-aware identity and same-name collision handling while preventing lifecycle operations from dropping the user onto a false not-found page.

### 2. Safe state and action controls

`AgentToggle` is replaced by a control that visually separates:

- a non-interactive status badge (`Project install`, `Global install`, `Available`, `No source`);
- an explicit action button (`Install`, `Remove from project`, or `Manage global`).

Removing a project installation requires confirmation. The message includes Skill name, project name/path suffix, affected Agent group, and states that the Skill remains in the catalog.

Shared Codex/Gemini directories remain one backend action group. The confirmation names all shared Agents so one click cannot silently affect another column.

Project-level bulk actions first show a confirmation summary:

- install: number of Skills and Agent targets that will be added;
- uninstall: number of project-local Skills and Agent targets that will be removed;
- global inherited installations are explicitly excluded from project uninstall.

Buttons remain disabled while work is running. Completion shows a persistent success summary; partial failure keeps the existing failure count and adds the successful count.

### 3. Targeted installation

Skill Detail owns the complete target workflow.

The top action area contains:

- `Install globally` when no global instance exists;
- a `Install in project` panel listing registered projects;
- the selected project's managed Agents and current state;
- explicit `Install` actions only for available targets.

The existing project-enable API remains the write primitive. The frontend sends one deduplicated action per shared Agent group and reports per-project success/failure. If there are no registered projects, the panel links to project registration with a return parameter containing the canonical Skill ID. After registration, Projects navigates back to that Skill detail page.

The old `Install To Project` link that discards context is removed.

### 4. Add Skill flow

The existing source action is honestly named `Install new Skill` and the dialog title matches. Supporting copy states that this action discovers the source, adds the Skill to the catalog, and installs it globally to the displayed Global targets.

This release does not invent a remote “catalog only” downloader. Known Skills can become catalog-only by removing all instances; adding an unseen remote source still requires an installation so metadata and content can be discovered safely.

The field receives a persistent label and examples. The dialog retains autofocus, Escape, and Enter behavior.

### 5. Overview and reconciliation health

Add `GET /api/overview` and `POST /api/reconcile`.

The overview response contains:

```ts
interface ProductOverview {
  generatedAt: string
  knownSkills: number
  skillsInstalledGlobally: number
  skillsInstalledInProjects: number
  catalogOnlySkills: number
  registeredProjects: number
  modifiedProjectCopies: number
  updateAvailableSkills: number
  sourceMissingSkills: number
  missingProjects: Array<{ path: string; name: string }>
}
```

Counts are explicitly counts of Skills, not raw installation directories. Dashboard labels use `Skills installed globally` and `Skills installed in projects` to remove ambiguity.

`POST /api/reconcile` performs an on-demand inventory reconciliation and returns a fresh overview. Dashboard shows `Last scanned`, a `Scan now` action, and attention cards for modified copies, updates, missing sources, and missing registered paths.

Missing/unreadable project path detection is included. Capturing all possible upstream CLI failure diagnostics is deferred unless the existing adapter can return them without changing its public contract.

### 6. First-run guidance and project registration

When there are no Skills and no projects, Dashboard shows an ordered setup card:

1. Register a project.
2. Confirm the project's managed Agents.
3. Install the first Skill globally or into that project.

Empty Skills and Projects pages include an in-context primary action and concise explanation of what happens next.

Project registration performs client-side absolute-path validation before submission. The server continues to be authoritative and returns a human-readable missing/unreadable path error. The form explains that registration does not move or delete project files and that only registered paths are scanned.

### 7. Maintenance recovery and catalog deletion

For each modified project copy, Skill Detail exposes `Reinstall from source`. The server action reinstalls the Skill into the affected project Agent group using the existing inventory source and then reconciles.

Catalog-only Skills expose `Forget Skill`. It requires confirmation and is rejected by the server if any installation instance still exists. Forgetting removes the inventory record. It removes an archive directory only when the path is inside the configured `skills-ui` archive root and no other inventory entry references it; it never removes arbitrary source directories.

### 8. Error and success feedback

Server routes map operational failures into safe user-facing messages. Raw `SkillsCliError` command strings are not returned directly.

Expected mappings include:

- missing local source → `The local Skill path could not be found.`
- unreadable source/project → `The path exists but cannot be read.`
- remote source failure → `The Skill source could not be installed. Check the repository and network connection.`
- unsupported or conflicting action → a specific 409 message.

Technical details may be logged to the terminal, but the JSON response contains only the safe message. Frontend success messages state what changed and what was preserved.

## File Boundaries

- `src/core/inventory.ts`: alias continuity, catalog deletion, project reinstall.
- `src/core/types.ts`: aliases and overview-related shared types where appropriate.
- `src/server/routes/skills.ts`: safe errors, reinstall and forget routes.
- `src/server/routes/overview.ts`: overview and reconcile endpoints.
- `src/server/index.ts`: mount overview routes.
- `src/web/api.ts`: new endpoint types and calls.
- `src/web/components/AgentSkillControl.tsx`: separated status/action UI and confirmations.
- `src/web/components/InstallProjectPanel.tsx`: targeted project installation.
- `src/web/components/AddSkillDialog.tsx`: consistent naming, labels, and explanatory copy.
- `src/web/pages/Dashboard.tsx`: health summary, scan action, first-run guide.
- `src/web/pages/Skills.tsx`: terminology, empty state, success feedback.
- `src/web/pages/SkillDetail.tsx`: canonical redirect, target panel, recovery, forget action.
- `src/web/pages/Projects.tsx`: registration guidance, return-to-Skill behavior, clearer Agent settings.
- `src/web/pages/ProjectDetail.tsx`: bulk preview/confirmation and explicit action controls.

## Data Flow

1. A page reads Skills/projects/overview through React Query.
2. A user selects an explicit action with a named scope.
3. Destructive actions present an impact confirmation before sending a request.
4. The server resolves canonical ID or alias and validates current state.
5. Inventory performs the filesystem/CLI operation and reconciles.
6. The server returns the canonical Skill or fresh overview where useful.
7. React Query invalidates Skills, Skill, Project, and overview keys.
8. Detail pages replace stale alias URLs with the canonical URL.
9. The UI displays a success or safe error summary.

## Testing Strategy

All behavior changes follow red-green-refactor.

### Core tests

- A modified project Skill retains an alias after its installation disappears.
- Repeated catalog-only reconciles keep resolving the original alias.
- Alias lookup returns the canonical Skill.
- Forget is rejected when instances exist and removes only catalog/archive state otherwise.
- Project reinstall uses the recorded source and preserves target grouping.

### Server tests

- GET by alias returns the canonical ID.
- Reinstall and forget validate state and status codes.
- Overview count semantics match labels.
- Reconcile returns a fresh timestamp and overview.
- Raw CLI commands and absolute home paths are absent from error JSON.

### Browser tests

- `Project install` is a status badge, and removal uses an explicit confirmed button.
- After project uninstall, Skill Detail stays valid and canonicalizes its URL.
- Targeted project install completes without leaving Skill Detail.
- Bulk uninstall requires confirmation and summarizes impact.
- First-run Dashboard presents ordered setup.
- Empty Skills/Projects present actionable guidance.
- Add Skill copy clearly says it installs globally.
- Dashboard scan updates `Last scanned` and health counts.
- Modified copy exposes and completes reinstall.
- Catalog-only Skill can be forgotten with confirmation.

### Final verification

- `npm test`
- `npm run build`
- `npm run test:docker`
- `npm run test:e2e`
- Desktop browser acceptance at `1440 × 900` using isolated synthetic data

## Acceptance Criteria

- No status-only label performs an unexpected write.
- Every destructive write has an impact confirmation.
- Project uninstall never leaves the current Skill journey on a false 404.
- A known Skill can be installed into a selected registered project from Skill Detail.
- Dashboard explains inventory health and data freshness.
- First-run pages identify a recommended next action.
- Modified project copies have a recovery action.
- Catalog-only Skills can be forgotten without touching external source directories.
- User-facing errors contain no raw command, token, home directory, or full host-specific path.
- All existing and new tests pass in the normal, Docker, and E2E suites.
