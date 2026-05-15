---
name: skills-ui-design-summary
description: Review skills-ui work against docs/PRODUCT_DESIGN.md, DEVELOPMENT.md, README.md, and docs/TODOLIST.md; update lightweight project memory when product or architecture reality changed; then verify the highest-priority feasible follow-up. Use near the end of skills-ui implementation or product-design turns.
---

# skills-ui Design Summary

## Overview

Use this skill near the end of a meaningful `skills-ui` turn.

It keeps project memory aligned with the implementation without creating heavy process.

The project memory files are:

- `docs/PRODUCT_DESIGN.md`: product model, asset semantics, workflow direction
- `docs/TODOLIST.md`: prioritized product backlog
- `DEVELOPMENT.md`: implementation architecture, current status, known boundaries
- `README.md`: user-facing setup and command entry points

## Product Posture

Treat `skills-ui` as a local skill asset manager.

The upstream `skills` CLI is an operational adapter for discovery and installs, not the whole product model.
`skills-ui` should maintain durable assets, installed instances, provenance, reconcile behavior, and UI workflows around that adapter.

Manual user changes are allowed:

- users may run `skills add/remove/update` outside `skills-ui`
- users may edit or delete skill folders
- registered projects may become missing or broken

The product should reconcile from that reality instead of assuming `skills-ui` is the only writer.

## Review Workflow

1. Read the current project memory files listed above.
2. Review the files changed in the turn.
3. Decide whether product or implementation reality changed.
4. Update only the docs that are stale.
5. If implementation changed, run the relevant validation command when feasible, usually `npm test` and/or `npm run build`.
6. Check `docs/TODOLIST.md` and identify whether a top-priority feasible item should be completed now.

## Update Rules

Update `docs/PRODUCT_DESIGN.md` when:

- asset, install-instance, source, version, or conflict semantics changed
- compatibility with upstream `skills` changed
- a new core workflow is accepted
- a design assumption is corrected

Update `docs/TODOLIST.md` when:

- priorities changed
- a task was completed
- a newly discovered bug or gap should be tracked

Update `DEVELOPMENT.md` when:

- architecture, commands, validation status, or known boundaries changed
- a new core module or workflow was added

Update `README.md` when:

- user-facing commands or entry points changed

Do not update shared docs for local-only noise under ignored paths such as `.xtest/`, `.agents/`, `.claude/`, `.codex/`, `.DS_Store`, or `dist/`.

## Close-Out

Before final response, summarize:

- docs changed
- validation run
- remaining highest-priority gap

