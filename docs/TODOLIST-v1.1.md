# Todolist v1.1

This is the prioritized product backlog after accepting the 15 development findings.

## Top 3 Next Tasks

1. `P0` `testing` Project discovery error surfacing
   - Why: broken registered projects are skipped during reconciliation, but users still cannot identify the failed project in the UI.
   - Done when: missing or unreadable projects appear in Projects and Dashboard without blocking the asset catalog.
   - Status: todo

2. `P0` `feature` Targeted install workflow
   - Why: project matrix actions work, but asset detail still lacks one explicit global-or-project target picker.
   - Done when: a known asset can be installed globally or into any registered project from its detail page.
   - Status: partial

3. `P1` `feature` Delete catalog asset
   - Why: uninstall now has confirmations, but forgetting a catalog-only asset remains a separate missing lifecycle action.
   - Done when: a catalog-only asset can be deleted with confirmation and cannot be confused with uninstalling an instance.
   - Status: todo

## Backlog

4. `P1` `testing` Expand browser workflow coverage
   - Why: Docker Playwright now covers the accepted error and keyboard flows, but successful install, promote, and delete journeys are not covered.
   - Done when: browser tests cover successful global install, targeted project install, promote/split, and catalog deletion.
   - Status: partial

5. `P1` `maintenance` Resolve dependency audit advisories
   - Why: the clean Docker install reports inherited production advisories plus advisories in the browser-test toolchain.
   - Done when: advisories are triaged by runtime reachability and safe upgrades reduce the count without breaking the build or browser suite.
   - Status: todo

6. `P2` `feature` Project settings polish
   - Why: managed agents are editable, while display-name editing and clearer save state remain incomplete.
   - Done when: project display name and managed agents can be edited with success and error feedback.
   - Status: partial

7. `P2` `testing` Responsive layout pass
   - Why: dense tables and detail pages still need explicit small-screen acceptance.
   - Done when: Dashboard, Assets, Projects, and detail pages pass checks at 390 px, 768 px, and desktop widths.
   - Status: partial

## Notes

- The 15-item development acceptance is recorded in `docs/testing/development-open-issues-acceptance-v1.1.md`.
- Browser coverage now verifies error propagation, destructive confirmation, keyboard controls, typed 404 handling, toggle feedback, and partial bulk failure handling.
- Keep remote CLI-managed operations compatible with `skills`; keep local/archive/manual operations filesystem-backed with skills-ui metadata.
- Preserve catalog assets after their installation instances disappear.
