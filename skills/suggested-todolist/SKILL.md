---
name: suggested-todolist
description: Build and maintain a prioritized skills-ui todolist in .DEVELOPMENT/TODOLIST.md, and keep the global issue registry .DEVELOPMENT/ISSUES.md current, by reviewing the root DEVELOPMENT.md, README.md, and the current implementation state. Use only when the user explicitly asks to refresh, create, revise, inspect, or run the skills-ui todolist/backlog/issue-registry workflow. Do not run automatically after ordinary code, test, CLI, server, or UI changes.
---

# Suggested Todolist

## Overview

Use this skill only when the user explicitly asks for todolist, backlog, priority, next-task, or
issue-registry work.

Do not treat this skill as a mandatory end-of-turn close-out step after code, test, CLI, server, or UI
edits. Ordinary implementation turns should finish with the requested work, appropriate verification,
and a concise final response unless the user explicitly asks for this todolist workflow.

This skill exists to turn current project state into a concrete, prioritized execution backlog.
It should not write vague ideas.
It should write actionable work items into `.DEVELOPMENT/TODOLIST.md`.

The goal is to keep the next development steps explicit, prioritized, and grounded in:

- current implementation reality
- current design decisions in `DEVELOPMENT.md`
- current user-facing behavior described in `README.md`
- current testing and performance gaps

## Required Inputs

Before writing the todolist, read:

- `DEVELOPMENT.md` (repo root)
- `README.md` (repo root)
- `.DEVELOPMENT/ISSUES.md` (the global issue registry — reconcile it with this turn's findings)
- files changed this turn
- any runtime or test files materially relied on this turn

Also inspect enough of the current implementation to identify:

- the most important missing feature or UX pieces (CLI commands, API routes, Web UI screens)
- technical risks that will slow future iteration (state/symlink correctness, error handling, types)
- missing validation or regression coverage (Vitest unit, Supertest HTTP integration)
- performance or startup costs that are already visible

## Collaboration Contract

Treat the user as the product and UX lead.
Do not expect the user to decompose every engineering prerequisite.

Unless blocked by product decisions or external dependencies, assume the AI collaborator should
proactively carry foundational engineering work such as:

- CLI command and Express route wiring
- React component scaffolding and API-client hooks
- TypeScript type and `constants.ts` additions
- state/symlink and atomic-write correctness in `src/core/`
- Vitest and Supertest coverage
- focused architecture cleanup

This todolist should reflect that posture.
Do not write tasks that merely restate the user's direction while skipping obvious enabling work.

## What The Todolist Must Include

Each refresh of `.DEVELOPMENT/TODOLIST.md` must include suggested tasks from all three lenses:

- functional or feature work
- performance or scalability work
- testing or validation work

The list should be ordered by priority, not grouped into isolated buckets.
However, each task must still expose its type clearly.

Good task properties:

- concrete
- bounded
- implementable without a new product decision
- directly useful to ongoing skills-ui development

Avoid:

- vague aspirations
- duplicate tasks
- tasks already completed
- purely local AI tooling work
- tasks sourced only from ignored local paths such as `node_modules/`, `dist/`, `.vite/`, `coverage/`,
  `.claude/`, `.codex/`, `.gemini/`, `.antigravity/`, `.cursor/`, `.agent/`, `.agents/`, `.worktrees/`

Use `.gitignore` as a first-pass filter for local-only noise.

## Defect & Leftover Tracking (`.DEVELOPMENT/ISSUES.md`)

`.DEVELOPMENT/TODOLIST.md` is the *forward* execution backlog. The global issue registry
`.DEVELOPMENT/ISSUES.md` holds **known defects, tech-debt, UX gaps, and optimization needs**, plus
anything explicitly moved out of a task's scope.

This is a hard rule:

- Any defect or out-of-scope leftover discovered this turn **must be recorded in ISSUES.md**, not left
  only in a scratch note or a PR description (those go stale and the issue is lost). If a plan/spec doc
  records a deviation that outlives its task, mirror it into ISSUES.md.
- Keep ISSUES.md and TODOLIST.md consistent: when you schedule an issue, add a TODOLIST task and
  cross-link it (issue → `scheduled`); when a backlog item lands, flip its status and, if it closed a
  registry issue, move that issue to the `Resolved (history)` section with a date.
- Entry shape in ISSUES.md: id `<BUG|DEBT|UX|PERF>-NNN` (never reused), severity, status
  (`open`/`scheduled`/`resolved`), discovered date, where it lives in code, and how it was found.

If the repo has a conventions doc (`AGENTS.md`, `CLAUDE.md`, or `DEVELOPMENT.md`), keep this issue-tracking
rule consistent with it; this skill is the source of truth for the registry format if none is stated.

Do this in the same close-out pass that refreshes the todolist.

## Priority Rules

Prioritize using this order of judgment:

1. Work that unblocks meaningful product iteration (a needed CLI command, route, or UI flow)
2. Work that prevents drift from the design decisions in `DEVELOPMENT.md` (state-first ordering, atomic
   writes, bundled `skills` binary, agent whitelist, path validation)
3. Work that prevents drift between actual CLI/UI behavior and `README.md`
4. Work that closes risky validation gaps around newly added routes, commands, or state operations
5. Work that improves performance or extensibility before the cost becomes entrenched
6. Nice-to-have polish

Performance tasks should be ranked alongside feature and testing tasks rather than automatically pushed
to the bottom.

## Output Format

Write `.DEVELOPMENT/TODOLIST.md` as a living prioritized list.

Use this structure:

1. Short title and purpose
2. `Top 3 Next Tasks`
3. `Backlog`
4. `Notes`

For each task, include:

- priority label such as `P0`, `P1`, `P2`
- task type: `feature`, `performance`, or `testing`
- a concise task title
- one sentence for why it matters now
- a short definition of done
- status, defaulting to `todo`

The `Top 3 Next Tasks` section should contain the three highest-priority unfinished items that are clear
enough to execute next.

## Interaction With dev-session-summary

This skill does not automatically hand off to `dev-session-summary`.

Its job is to refresh the prioritized todolist and reconcile the issue registry when explicitly
requested.

If the user explicitly asks for both `$suggested-todolist` and `$dev-session-summary`, run this skill
first, then follow the summary skill's current instructions.

Do not infer permission to execute newly discovered todolist items from refreshing the todolist.
Treat newly added tasks as recommendations unless the user explicitly asks to implement them.

The opt-in order is:

1. run `$suggested-todolist`
2. stop after reporting the refreshed backlog, unless the user also explicitly asked for follow-through
3. if explicitly requested, run `$dev-session-summary` or implement selected items

## Close-Out Rule

When this skill is explicitly invoked:

1. Refresh `.DEVELOPMENT/TODOLIST.md`
2. Reconcile `.DEVELOPMENT/ISSUES.md`: record any defect/tech-debt/UX/optimization or out-of-scope
   leftover found this turn, and update statuses for anything scheduled or resolved
3. Ensure the top three tasks are still the most important feasible next steps
4. Do not hand off to `dev-session-summary` or execute todolist items unless the user explicitly
   requested that extra follow-through
