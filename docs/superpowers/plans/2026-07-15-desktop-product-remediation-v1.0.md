# Desktop Product Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop Skill-management journey continuous, explicit, recoverable, and safe without exposing host secrets or replacing the filesystem-first architecture.

**Architecture:** Preserve the existing inventory manager, Express routers, React Query data flow, and CLI adapter. Add alias-based catalog continuity at the inventory boundary, product overview and recovery operations at explicit server boundaries, then consume those APIs through focused desktop components that separate state from actions.

**Tech Stack:** TypeScript 5.7, Node.js 18+, Express 4, React 19, React Router 7, TanStack React Query 5, Vitest 2, Supertest 7, Playwright 1.49, Vite 6, Docker.

## Global Constraints

- Desktop web UI only; acceptance viewport is `1440 × 900`.
- Preserve direct filesystem operations for local/archive/manual Skills and the `skills` CLI for remote CLI-managed Skills.
- Scan only registered projects; do not add a daemon, scheduler, framework, or component library.
- Keep existing inventory files readable without a manual migration.
- Never return or commit a token, real home directory, full CLI command, or host-specific absolute path.
- Every production behavior change follows red-green-refactor and receives a focused commit on `development`.

---

### Task 1: Preserve Catalog Identity Across Reconciliation

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/inventory.ts`
- Test: `tests/core/inventory.test.ts`
- Test: `tests/server/skills.test.ts`

**Interfaces:**
- Produces: `InventorySkill.aliases?: string[]`.
- Produces: `resolveSkillRef(ref, projects)` resolution order canonical ID, alias, unique name.
- Consumes: existing content-derived canonical IDs and inventory JSON normalization.

- [ ] **Step 1: Write the failing core tests**

Add tests which create a discovered project Skill, retain its first ID, change its content so reconciliation produces a second ID, remove the live instance, and assert both IDs resolve to the final canonical Skill:

```ts
const first = await manager.resolveSkillRef('continuity-skill', [project])
expect(first).toBeDefined()
await writeSkill(skillDir, 'continuity-skill', 'changed content')
const changed = await manager.reconcile([project])
const canonical = Object.values(changed.skills).find(skill => skill.name === 'continuity-skill')!
expect(canonical.id).not.toBe(first!.id)
expect(canonical.aliases).toContain(first!.id)
mockListInstalledSkills.mockResolvedValue([])
const resolved = await manager.resolveSkillRef(first!.id, [project])
expect(resolved?.id).toBe(canonical.id)
```

Also load legacy inventory JSON without `aliases` and assert reconciliation succeeds.

- [ ] **Step 2: Verify the core tests fail for missing alias continuity**

Run: `npm test -- tests/core/inventory.test.ts`

Expected: FAIL because the previous ID is absent from `aliases` and cannot be resolved after re-keying.

- [ ] **Step 3: Implement minimal alias normalization and propagation**

Add the type and one canonical helper:

```ts
export interface InventorySkill extends Skill {
  aliases?: string[]
  reinstallSource: string
  sourceType: string
  archivedPath?: string
  instances: SkillInstance[]
}

function mergeAliases(canonicalId: string, ...values: Array<string[] | undefined>): string[] | undefined {
  const aliases = Array.from(new Set(values.flatMap(value => value ?? [])))
    .filter(alias => alias && alias !== canonicalId)
  return aliases.length > 0 ? aliases : undefined
}
```

When a discovered or preserved Skill receives a different ID, merge `previous.id`, `previous.aliases`, and existing aliases. Normalize malformed/missing alias arrays to `undefined`. Resolve aliases before names:

```ts
const aliasMatches = Object.values(inventory.skills)
  .filter(skill => skill.aliases?.includes(ref))
if (aliasMatches.length === 1) return aliasMatches[0]
if (aliasMatches.length > 1) throw new Error(`Skill reference "${ref}" is ambiguous. Use the catalog ID instead.`)
```

- [ ] **Step 4: Verify core behavior and add the API contract test**

Run: `npm test -- tests/core/inventory.test.ts`

Expected: PASS.

Add a server test where `resolveSkillRef('old-id', [])` returns `{ id: 'canonical-id', ... }`, then assert `GET /api/skills/old-id` returns status 200 and body `id === 'canonical-id'`.

Run: `npm test -- tests/server/skills.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit catalog continuity**

```bash
git add src/core/types.ts src/core/inventory.ts tests/core/inventory.test.ts tests/server/skills.test.ts
git commit -m "fix: preserve skill identity across reconciliation"
```

### Task 2: Canonicalize Detail URLs and Separate State from Actions

**Files:**
- Create: `src/web/components/AgentSkillControl.tsx`
- Modify: `src/web/pages/SkillDetail.tsx`
- Modify: `src/web/pages/ProjectDetail.tsx`
- Delete: `src/web/components/AgentToggle.tsx`
- Test: `e2e/specs/development-findings.spec.ts`

**Interfaces:**
- Consumes: `SkillWithStatus.id`, `AgentSkillStatus`, `enableSkill`, and `disableSkill`.
- Produces: `AgentSkillControl` with explicit `Install`/`Remove from project` buttons and a non-interactive state badge.

- [ ] **Step 1: Write failing browser tests for canonical navigation and destructive confirmation**

Mock the old detail URL to return a canonical ID, then assert the URL is replaced. Mock a project-installed state and assert clicking the `Project install` badge makes no request, while `Remove from project` opens a confirmation naming the Skill, project, and shared agents. Cancel must make no request; accept must make one deduplicated request.

```ts
await page.goto('/skills/old-id')
await expect(page).toHaveURL(/\/skills\/canonical-id$/)
await expect(page.getByText('Project install')).toBeVisible()
await page.getByText('Project install').click()
expect(disableRequests).toHaveLength(0)
await page.getByRole('button', { name: 'Remove from project' }).click()
```

- [ ] **Step 2: Verify the browser tests fail for the current toggle behavior**

Run: `npx playwright test e2e/specs/development-findings.spec.ts --grep "canonical|Remove from project"`

Expected: FAIL because the current status pill performs the mutation and stale route IDs are not replaced.

- [ ] **Step 3: Implement canonical URL replacement**

In `SkillDetail`, read `id` from `useParams` and call navigation only after the query succeeds:

```ts
const navigate = useNavigate()
useEffect(() => {
  if (skill && id && skill.id !== id) {
    navigate(`/skills/${encodeURIComponent(skill.id)}`, { replace: true })
  }
}, [id, navigate, skill])
```

- [ ] **Step 4: Implement `AgentSkillControl`**

Render the status as `<span>` and a separate button. Confirm only removal; include `status.sharedWith`, and invalidate `skills`, `skill`, `project`, and `overview` after success. `Global install` exposes `Manage global` as a link to canonical Skill detail rather than a write.

```tsx
<span className={badgeClass}>{statusLabel}</span>
{status.canEnable && <button onClick={() => mutation.mutate('enable')}>Install</button>}
{status.canDisable && (
  <button onClick={() => {
    if (window.confirm(removalSummary)) mutation.mutate('disable')
  }}>Remove from project</button>
)}
```

Use the component from both detail pages and remove `AgentToggle.tsx`.

- [ ] **Step 5: Verify and commit the safe control**

Run: `npm test && npm run build`

Expected: all unit tests and both builds PASS.

Run: `npx playwright test e2e/specs/development-findings.spec.ts --grep "canonical|Remove from project"`

Expected: PASS.

```bash
git add src/web/components/AgentSkillControl.tsx src/web/pages/SkillDetail.tsx src/web/pages/ProjectDetail.tsx src/web/components/AgentToggle.tsx e2e/specs/development-findings.spec.ts
git commit -m "fix: make project skill actions explicit"
```

### Task 3: Complete Targeted Project Installation and Bulk Confirmation

**Files:**
- Create: `src/web/components/InstallProjectPanel.tsx`
- Modify: `src/web/pages/SkillDetail.tsx`
- Modify: `src/web/pages/ProjectDetail.tsx`
- Modify: `src/web/pages/Projects.tsx`
- Modify: `src/web/api.ts`
- Test: `e2e/specs/development-findings.spec.ts`

**Interfaces:**
- Produces: `InstallProjectPanel({ skill, projects })` that invokes `enableSkill(skill.id, project.path, representativeAgent)` once per shared group.
- Produces: registration return query `?returnSkill=<canonical-id>`.
- Consumes: existing project matrix status and agent-group semantics returned by the API.

- [ ] **Step 1: Add failing targeted-install and bulk-confirmation browser tests**

Assert a user can choose a registered project from Skill Detail, see managed Agent states, install without leaving the page, and receive `Installed in <project>`. Assert no-project state links to `/projects?returnSkill=<id>`. Assert bulk install/uninstall sends no requests before confirmation and its message gives Skill count, Agent target count, and says global installations are excluded from project removal.

- [ ] **Step 2: Verify the tests fail on the dead-end link and unconfirmed bulk writes**

Run: `npx playwright test e2e/specs/development-findings.spec.ts --grep "targeted install|bulk confirmation"`

Expected: FAIL because `Install To Project` navigates away and bulk actions start immediately.

- [ ] **Step 3: Implement the targeted panel**

Fetch projects, let the user select one, derive available actions from `skill.status[project.path]`, and deduplicate shared groups by sorting `[agent, ...(sharedWith ?? [])]` into a key. Send only the first agent for each key:

```ts
const actions = Object.entries(status)
  .filter(([, value]) => value.canEnable)
  .filter(([agent, value], index, rows) => {
    const key = [agent, ...(value.sharedWith ?? [])].sort().join('|')
    return rows.findIndex(([candidate, item]) =>
      [candidate, ...(item.sharedWith ?? [])].sort().join('|') === key
    ) === index
  })
await Promise.all(actions.map(([agent]) => enableSkill(skill.id, project.path, agent)))
```

Keep the user on the detail page, invalidate affected queries, and show successful/failed target counts.

- [ ] **Step 4: Add preview state to project bulk operations**

Before executing, compute rows with `canEnable` or `canDisable`, collapse shared groups, and call `window.confirm(summary)`. Do not include `state === 'global'` in uninstall. Preserve progress display and change completion copy to `N succeeded, M failed`.

- [ ] **Step 5: Implement return-to-Skill after registration**

Read `returnSkill` with `useSearchParams`. After successful registration, navigate to `/skills/<returnSkill>`; otherwise remain on Projects. Validate that the return value is used only as an encoded route segment, never as a filesystem input.

Before submission, require an absolute POSIX path (`value.startsWith('/')`) or an absolute Windows path (`/^[A-Za-z]:[\\/]/`). Show `Enter an absolute project path.` without sending a request. Add explanatory copy: `Registration does not move or delete project files. Only registered paths are scanned.` The server remains authoritative for existence and readability.

- [ ] **Step 6: Verify and commit the completed workflows**

Run: `npm test && npm run build`

Run: `npx playwright test e2e/specs/development-findings.spec.ts --grep "targeted install|bulk confirmation"`

Expected: PASS with no duplicate shared-agent requests.

```bash
git add src/web/components/InstallProjectPanel.tsx src/web/pages/SkillDetail.tsx src/web/pages/ProjectDetail.tsx src/web/pages/Projects.tsx src/web/api.ts e2e/specs/development-findings.spec.ts
git commit -m "feat: install skills into selected projects"
```

### Task 4: Sanitize Operational Errors and Clarify Source Installation

**Files:**
- Create: `src/server/safe-errors.ts`
- Modify: `src/server/routes/skills.ts`
- Modify: `src/server/routes/projects.ts`
- Modify: `src/web/components/AddSkillDialog.tsx`
- Modify: `src/web/pages/Skills.tsx`
- Test: `tests/server/skills.test.ts`
- Test: `tests/server/projects.test.ts`
- Test: `e2e/specs/development-findings.spec.ts`

**Interfaces:**
- Produces: `safeOperationalError(error: unknown): { status: number; message: string }`.
- Produces: UI term `Install new Skill` and explicit global-target explanation.

- [ ] **Step 1: Write failing server leakage tests**

Make mocked CLI errors include `skills add owner/private --global`, `/Users/real-person/private`, and a token-shaped string. Assert response JSON contains none of those values and equals the remote-source fallback. Add local missing/unreadable tests for the two required safe messages.

- [ ] **Step 2: Verify the leakage tests fail**

Run: `npm test -- tests/server/skills.test.ts tests/server/projects.test.ts`

Expected: FAIL because current routes return `SkillsCliError.message` and combine missing/unreadable project paths.

- [ ] **Step 3: Add one server-boundary error mapper**

```ts
export function safeOperationalError(error: unknown): { status: number; message: string } {
  if (error instanceof SkillsCliError) {
    return { status: 422, message: 'The Skill source could not be installed. Check the repository and network connection.' }
  }
  if (isMissingPathError(error)) return { status: 404, message: 'The local Skill path could not be found.' }
  if (isUnreadablePathError(error)) return { status: 403, message: 'The path exists but cannot be read.' }
  return { status: 500, message: 'The operation could not be completed.' }
}
```

Log only `error.name` plus an operation identifier; do not print command arguments or user paths. Apply the mapper to every Skill write route. Use separate `stat`/`access` handling in project registration without echoing the submitted path.

- [ ] **Step 4: Update Add Skill language and persistent labeling**

Change page/button/dialog title to `Install new Skill`. Add `<label htmlFor="skill-source">Skill source</label>`, examples, and this description: `Discovers the source, adds its Skills to this catalog, and installs them globally to the enabled Global targets.` Keep autofocus, Enter, and Escape behavior.

Change the Skills page heading, loading/search text, filters, and empty-state primary terminology from `Assets` to `Skills`; retain `asset` only in explanatory copy describing the durable catalog concept. Show a persistent success summary identifying what was installed globally.

- [ ] **Step 5: Verify and commit safe messaging**

Run: `npm test -- tests/server/skills.test.ts tests/server/projects.test.ts`

Run: `npx playwright test e2e/specs/development-findings.spec.ts --grep "Install new Skill|safe error"`

Expected: PASS and response bodies contain no seeded command, token, or path.

```bash
git add src/server/safe-errors.ts src/server/routes/skills.ts src/server/routes/projects.ts src/web/components/AddSkillDialog.tsx src/web/pages/Skills.tsx tests/server/skills.test.ts tests/server/projects.test.ts e2e/specs/development-findings.spec.ts
git commit -m "fix: sanitize errors and clarify skill installation"
```

### Task 5: Add Product Overview, Reconciliation Health, and First-Run Guidance

**Files:**
- Create: `src/core/overview.ts`
- Create: `src/server/routes/overview.ts`
- Modify: `src/core/types.ts`
- Modify: `src/server/index.ts`
- Modify: `src/web/api.ts`
- Modify: `src/web/pages/Dashboard.tsx`
- Modify: `src/web/pages/Skills.tsx`
- Modify: `src/web/pages/Projects.tsx`
- Test: `tests/core/overview.test.ts`
- Test: `tests/server/overview.test.ts`
- Test: `e2e/specs/development-findings.spec.ts`

**Interfaces:**
- Produces: `ProductOverview` exactly as defined in the approved design.
- Produces: `buildProductOverview(skills, projects, maintenance, generatedAt): ProductOverview`.
- Produces: `GET /api/overview`, `POST /api/reconcile`, `getOverview()`, and `reconcileOverview()`.

- [ ] **Step 1: Write failing count-semantics tests**

Use one Skill installed globally in two directories, one Skill installed across two projects, one catalog-only Skill, a missing registered project, modified maintenance, update-available maintenance, and missing-source metadata. Assert each Skill is counted once per category and `missingProjects` contains only safe display data rather than raw inaccessible paths.

- [ ] **Step 2: Verify the overview tests fail because the module and routes do not exist**

Run: `npm test -- tests/core/overview.test.ts tests/server/overview.test.ts`

Expected: FAIL with missing module/404 assertions.

- [ ] **Step 3: Implement overview aggregation and routes**

Define:

```ts
export interface ProductOverview {
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

Count with `skills.filter(...)` predicates rather than instance lengths. `GET` reconciles once and aggregates; `POST /api/reconcile` explicitly reconciles then returns a newly generated overview. Mount the router before the API fallback.

- [ ] **Step 4: Replace Dashboard directory-like counts with product counts**

Show `Last scanned`, `Scan now`, `Known Skills`, `Skills installed globally`, `Skills installed in projects`, and `Catalog-only Skills`. Add attention cards for modified copies, updates, missing sources, and missing projects. When both `knownSkills` and `registeredProjects` are zero, show the ordered three-step setup guide from the design.

- [ ] **Step 5: Add actionable empty states**

Skills empty state opens `Install new Skill`; Projects empty state opens project registration. Both explain the next filesystem effect. Preserve normal search-empty copy when Skills exist but filters return no rows.

- [ ] **Step 6: Verify and commit overview health**

Run: `npm test -- tests/core/overview.test.ts tests/server/overview.test.ts`

Run: `npm run build`

Run: `npx playwright test e2e/specs/development-findings.spec.ts --grep "first-run|Last scanned|empty state"`

Expected: PASS; scan changes the displayed timestamp and count labels refer to Skills.

```bash
git add src/core/overview.ts src/core/types.ts src/server/routes/overview.ts src/server/index.ts src/web/api.ts src/web/pages/Dashboard.tsx src/web/pages/Skills.tsx src/web/pages/Projects.tsx tests/core/overview.test.ts tests/server/overview.test.ts e2e/specs/development-findings.spec.ts
git commit -m "feat: show inventory health and first-run guidance"
```

### Task 6: Add Recovery and Safe Catalog Forgetting

**Files:**
- Modify: `src/core/inventory.ts`
- Modify: `src/core/types.ts`
- Modify: `src/server/routes/skills.ts`
- Modify: `src/web/api.ts`
- Modify: `src/web/pages/SkillDetail.tsx`
- Test: `tests/core/inventory.test.ts`
- Test: `tests/server/skills.test.ts`
- Test: `e2e/specs/development-findings.spec.ts`

**Interfaces:**
- Produces: `reinstallProjectSkill(id, projectPath, projects): Promise<void>`.
- Produces: `forgetSkill(id, projects): Promise<void>`.
- Produces: `POST /api/skills/:id/reinstall-project` with `{ projectPath }` and `DELETE /api/skills/:id/catalog`.

- [ ] **Step 1: Write failing core safety tests**

Assert reinstall uses the recorded source and the project Agent group, then reconciles. Assert forget rejects Skills with any instance. For catalog-only Skills, assert inventory removal; archive deletion happens only when the archive is under `archiveDir` and no other Skill references it. Assert an external `reinstallSource` remains on disk.

- [ ] **Step 2: Verify the core tests fail for missing methods**

Run: `npm test -- tests/core/inventory.test.ts`

Expected: FAIL because `reinstallProjectSkill` and `forgetSkill` are not defined.

- [ ] **Step 3: Implement recovery and deletion guards**

Reuse `buildProjectSkillStatus` plus `getActionAgentsForStatus` to reinstall deduplicated project groups. For forgetting, reconcile, reject when `instances.length > 0`, remove the record, and delete archive only after resolving both paths and checking:

```ts
const insideArchive = archivedPath === resolvedArchive || archivedPath.startsWith(`${resolvedArchive}/`)
const shared = Object.values(state.skills).some(other =>
  other.id !== skill.id && other.archivedPath === skill.archivedPath
)
if (insideArchive && !shared) await rm(archivedPath, { recursive: true, force: true })
```

Never delete `source` or `reinstallSource` merely because it is absolute.

- [ ] **Step 4: Add route tests and UI actions**

Assert 404 for unknown Skill/project, 409 for installed Skill forget, and success for both writes. On Skill Detail, show `Reinstall from source` per modified project and `Forget Skill` only for catalog-only Skills. Both actions require confirmation; forgetting navigates to `/skills` only after success.

- [ ] **Step 5: Verify and commit maintenance recovery**

Run: `npm test -- tests/core/inventory.test.ts tests/server/skills.test.ts`

Run: `npx playwright test e2e/specs/development-findings.spec.ts --grep "Reinstall from source|Forget Skill"`

Expected: PASS and the external-source fixture still exists.

```bash
git add src/core/inventory.ts src/core/types.ts src/server/routes/skills.ts src/web/api.ts src/web/pages/SkillDetail.tsx tests/core/inventory.test.ts tests/server/skills.test.ts e2e/specs/development-findings.spec.ts
git commit -m "feat: recover and forget catalog skills safely"
```

### Task 7: Validate Desktop Product Acceptance and Publish

**Files:**
- Create: `docs/audits/product-experience-acceptance-v1.2/report-v1.2.md`
- Create: `docs/audits/product-experience-acceptance-v1.2/screenshots/*.png`
- Modify: `docs/superpowers/plans/2026-07-15-desktop-product-remediation-v1.0.md`

**Interfaces:**
- Consumes: every acceptance criterion from the approved design.
- Produces: reproducible automated results plus a desktop human/product acceptance record using synthetic paths only.

- [ ] **Step 1: Run focused and full local verification**

Run:

```bash
npm test
npm run build
```

Expected: all Vitest tests PASS; server and web builds complete with exit code 0.

- [ ] **Step 2: Run clean Docker verification**

Run: `npm run test:docker`

Expected: Docker image builds without host secrets and all tests PASS inside the disposable container.

- [ ] **Step 3: Run full browser automation**

Run: `npm run test:e2e`

Expected: all Playwright tests PASS with synthetic state and no requests outside the local test server.

- [ ] **Step 4: Perform the desktop business journey at `1440 × 900`**

Exercise first run, project registration, Skill source installation, targeted project install, cancel/confirm removal, canonical detail continuity, scan health, modified-copy reinstall, and catalog forgetting. Capture only synthetic project names and paths. Record pass/fail, observed copy, and any remaining issue in the versioned v1.2 report.

- [ ] **Step 5: Mark the plan complete and inspect secrets/diff**

Change completed checkboxes to `[x]`, then run:

```bash
git diff --check
git status --short
rg -n "/Users/|/home/|token=|Bearer |skills add .*--" src tests e2e docs --glob '!docs/audits/product-experience-acceptance-v1.0/**'
```

Expected: no whitespace errors; only intentional synthetic examples; no token or real host path.

- [ ] **Step 6: Commit and push final acceptance evidence**

```bash
git add docs/audits/product-experience-acceptance-v1.2 docs/superpowers/plans/2026-07-15-desktop-product-remediation-v1.0.md
git commit -m "test: record desktop product acceptance"
git push origin development
```

Expected: `origin/development` advances to the final local commit and the worktree is clean.
