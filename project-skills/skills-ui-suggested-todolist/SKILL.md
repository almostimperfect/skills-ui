---
name: skills-ui-suggested-todolist
description: Refresh the lightweight skills-ui product backlog in docs/TODOLIST.md from docs/PRODUCT_DESIGN.md, DEVELOPMENT.md, README.md, and the current implementation state. Use after product, architecture, UI, API, or test changes in the skills-ui repository when next work should be reprioritized.
---

# skills-ui Suggested Todolist

## Overview

Use this skill in the `skills-ui` repository when a turn changes product behavior, architecture, UI flows, API semantics, test coverage, or project documentation.

Its job is to keep [docs/TODOLIST.md](../../docs/TODOLIST.md) short, current, and execution-oriented.

## Required Inputs

Before editing the todolist, read:

- `docs/PRODUCT_DESIGN.md`
- `DEVELOPMENT.md`
- `README.md`
- files changed or materially relied on during the turn

Also inspect enough implementation context to identify:

- asset-management gaps
- `skills` CLI compatibility risks
- reconciliation and external-change handling gaps
- UI/UX issues
- missing tests or browser coverage

## Todolist Rules

Keep `docs/TODOLIST.md` lightweight.

Use this structure:

1. short title and purpose
2. `Top 3 Next Tasks`
3. `Backlog`
4. `Notes`

Each task should include:

- priority label: `P0`, `P1`, or `P2`
- type: `feature`, `testing`, `ux`, or `maintenance`
- concise title
- one sentence explaining why it matters now
- definition of done
- status, usually `todo`

Prioritize:

1. work that makes skill assets versus installation instances clear
2. work that keeps external `skills` CLI changes manageable
3. work that prevents one broken project from breaking the catalog
4. work that enables install/promote/delete asset workflows
5. browser and UI/UX test coverage

Avoid:

- vague ideas
- duplicate tasks
- completed work
- tasks about ignored local artifacts such as `.xtest/`, `.agents/`, `.claude/`, `.codex/`, `.DS_Store`, or `dist/`

## Close-Out

After updating `docs/TODOLIST.md`, briefly note what changed and why.

