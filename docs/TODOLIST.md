# Todolist

This is the lightweight product backlog for `skills-ui`.

## Top 3 Next Tasks

1. `P0` `testing` Project discovery error surfacing
   - Why: broken registered projects are now skipped during reconcile, but users still need to see which project failed.
   - Done when: missing/unreadable projects are reported in the Projects UI and dashboard without blocking the skills catalog.
   - Status: todo

2. `P0` `feature` Targeted install workflow
   - Why: assets can be installed globally to configured global agents and via project matrix actions, but the detail page still needs a single clear target picker.
   - Done when: a known asset can be installed to global or any registered project from one explicit detail-page workflow.
   - Status: partial

3. `P1` `feature` Delete catalog asset
   - Why: preserved assets need an explicit forget/delete action separate from uninstalling instances.
   - Done when: catalog-only assets can be deleted, with confirmation.
   - Status: todo

## Backlog

4. `P1` `testing` Browser coverage for asset workflows
   - Why: the current tests miss UI/UX failures and frontend error handling.
   - Done when: browser tests cover dashboard, skills catalog, project detail, install action, and error states.
   - Status: todo

5. `P1` `feature` Safer destructive actions
   - Why: removing global/project instances is high impact.
   - Done when: destructive actions have confirmation and clear distinction between uninstall and delete asset.
   - Status: partial

6. `P2` `feature` Project settings polish
   - Why: managed agents are editable in the UI, but display name editing and clearer save/error feedback are still missing.
   - Done when: a registered project can edit display name and managed agents.
   - Status: partial

7. `P2` `testing` Responsive layout pass
   - Why: mobile currently collapses into unusable narrow content.
   - Done when: dashboard, skills, projects, and detail pages are usable at 390px, 768px, and desktop widths.
   - Status: partial

8. `P2` `maintenance` Keep product docs synced
   - Why: product behavior is moving from install management to asset management.
   - Done when: docs/PRODUCT_DESIGN.md and this todolist are updated after each product-level change.
   - Status: ongoing

## Recently Completed

- `feature` Remote skill installs/removes now route through `skills` CLI while local/archive installs use direct copy without writing upstream locks.
- `feature` Global installs now use the configured enabled AI tools instead of upstream CLI defaults.
- `feature` Project rows can enable/disable managed agents, and project detail only shows enabled agents.
- `bugfix` Same-content global/project installs now reconcile into one asset, including old catalog-only archive duplicates.
- `feature` Skills list now presents assets with source labels, install counts, catalog-only state, and global install/uninstall actions.
- `feature` Skill detail now supports installing a known project/catalog asset globally.
- `testing` Reconcile skips broken registered project discovery instead of failing the whole skills catalog.

## Notes

- Keep the upstream `skills` CLI compatible: remote CLI-managed assets use CLI operations; local/archive/manual assets use filesystem operations and skills-ui metadata.
- Keep the asset catalog durable even after all install instances disappear.
- Treat docs and todolist as lightweight project memory, not a heavy process.
