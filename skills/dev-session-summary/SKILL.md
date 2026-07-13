---
name: dev-session-summary
description: Review skills-ui work, write a timestamped development log, and sync the project's living docs (root DEVELOPMENT.md and README.md) when explicitly requested. This skill may inspect .DEVELOPMENT/TODOLIST.md for context, but must not automatically execute highest-priority todolist items or run suggested-todolist unless the user explicitly asks for that follow-through.
---

# Dev Session Summary

## Overview

Use this skill only when the user explicitly asks for an end-of-session summary, development log,
project-doc sync, or a skills-ui development review.

The goal is to keep docs current and review drift when requested. It is not a default end-of-turn
execution gate for ordinary implementation work.

This skill has three jobs:

1. write a timestamped turn log
2. update the project's living docs when needed
3. optionally inspect `.DEVELOPMENT/TODOLIST.md` for context

Do not execute todolist items unless the user explicitly asks to implement todolist/backlog items.

The files that must remain reliable are:

- `DEVELOPMENT.md` (repo root): current implementation state — stack, run/build/test commands, project
  structure, key design decisions, blockers, next steps
- `README.md` (repo root): the user-facing explanation of the tool — install, CLI commands, Web UI,
  supported agents
- `.DEVELOPMENT/TODOLIST.md`: prioritized next work across feature, performance, and testing
- `.DEVELOPMENT/log/log-YYYY-MM-DD-HHMMSS.md`: timestamped log of what the current turn changed

Do not automatically run `$suggested-todolist` as a prerequisite. If the user explicitly asks for
both a todolist refresh and a development summary, run `$suggested-todolist` first, then continue into
this skill.

When this skill is explicitly invoked, follow this order:

1. write the timestamped log file
2. update `DEVELOPMENT.md` and `README.md` if needed
3. review for drift and correct it if needed
4. report any relevant todolist items as recommendations only, unless the user explicitly requested implementation

## Development Posture

When summarizing skills-ui work, do not frame in-progress CLI, server, core, or Web UI systems as
disposable demo work unless the user explicitly says something is throwaway.

Use this posture instead:

- skills-ui is a real tool under iterative development
- design may emerge through implementation, usage, and revision
- unfinished does not mean throwaway
- first-working CLI commands, API routes, or UI screens should be described as production-facing slices,
  not as "just demos"

Reflect that language in `DEVELOPMENT.md` whenever it materially affects project direction. If the
user-facing behavior of the tool changed, reflect that in `README.md` too.

## Collaboration Contract

Treat the user as the product and UX lead, not as the person responsible for spelling out every
implementation prerequisite.

In practice:

- the user may mainly define what the tool should do, how the CLI/UI should behave, and the intended
  workflow
- the user may not know which TypeScript, Express, React, state-management, data, or testing tasks are
  required underneath
- the AI collaborator should proactively do the foundational engineering work needed to make the
  requested direction real

This means the skill should push the work forward by default instead of waiting for exhaustive
instructions.

Examples of work the AI collaborator should usually infer and do directly when needed:

- CLI command wiring and Express route glue
- React component scaffolding, layout, and API-client hooks
- missing TypeScript types, `constants.ts` entries, and config fields
- state/symlink and atomic-write correctness in `src/core/`
- Vitest unit tests and Supertest HTTP integration tests
- small architecture refactors needed to keep a feature extensible
- developer-facing error handling and validation

Only stop and ask when the next step depends on a real product decision, conflicting direction, or a
missing external dependency.

## Applicability Check

Treat this skill as applicable when the workspace looks like the skills-ui project.
Confirm using a quick check such as the presence of:

- `package.json` with `"name": "skills-ui"`
- `src/core/` and `src/cli/index.ts`
- `DEVELOPMENT.md` at the repo root

If those files are missing and the task is clearly not skills-ui, do not use this skill.

## End-Of-Turn Workflow

### 1. Read the current project docs

Before reviewing or deciding whether to edit docs, read:

- `DEVELOPMENT.md`
- `README.md`
- `.DEVELOPMENT/TODOLIST.md` when it exists

Also read only the files touched or materially relied on during the current turn.

### 1.5. Filter out non-project changes

Do not treat AI coding tool files, local editor config, build output, or personal machine files as
project-state changes.

Use `.gitignore` as a first-pass heuristic for this boundary, especially for paths that are clearly
marked as local-only or tool-specific.

Never update `DEVELOPMENT.md` or `README.md` just because the turn changed files under paths such as:

- `node_modules/`
- `dist/`
- `.vite/`
- `coverage/`
- `*.tsbuildinfo`, `*.js.map`
- `.claude/`
- `.codex/`
- `.gemini/`
- `.antigravity/`
- `.cursor/`
- `.superpowers/`
- `.aider*`
- `.continue/`
- `.agent/`
- `.agents/`
- `.worktrees/`
- `skills-lock.json`
- `.DS_Store`

Treat those as local workflow noise unless the user explicitly asks to document them somewhere else.

### 2. Write the timestamped log first

Before updating shared project docs or continuing into todolist work, write a new timestamped log file:

- `.DEVELOPMENT/log/log-YYYY-MM-DD-HHMMSS.md`

Do not append to a daily log.
Create one log file per close-out pass.

The log entry should briefly capture:

- what was implemented in the turn so far
- what was validated so far (e.g. `npm test`, `npm run build`, manual CLI/UI checks)
- which todolist items are about to be attempted
- any blockers already known before follow-through starts

This log is a point-in-time execution snapshot.
Keep it factual and concise.

### 3. Decide whether `DEVELOPMENT.md` and `README.md` need updates

Before continuing into todolist work, decide whether the living docs need to be updated from the work
already completed in the turn.

If needed:

- update `DEVELOPMENT.md`
- update `README.md`

Do this before any explicitly requested todolist-task implementation.

### 4. Todolist Follow-Through Is Explicit Opt-In

Do not execute `.DEVELOPMENT/TODOLIST.md` items by default.

Only continue into todolist-driven implementation when the user explicitly asks for it, for example:

- "执行 todolist"
- "继续做 top 3"
- "跑 suggested-todolist 并实现里面的新需求"
- "complete the top priority backlog items"

Feasible means:

- the task is clear enough to implement now
- it does not require a new product decision
- it is not blocked by an external dependency

If explicit follow-through is requested and one of the selected tasks is blocked, too large for a
sensible single turn, or no longer current, document the reason briefly in the log and ask or move
to the next explicitly authorized item.

Without explicit follow-through, a final-message recommendation list is acceptable.

### 5. Review against project requirements

Before ending the turn, explicitly review the work against `DEVELOPMENT.md` and `README.md`.

Check at least these two questions:

1. Did this turn's implementation follow the current development and design requirements already
   written in those files (e.g. state-first ordering, atomic writes, bundled `skills` binary, agent
   whitelist, path validation)?
2. Did this turn stop too early even though there is an obvious next development step that should
   naturally follow?

When reviewing:

- compare actual code, types, routes, tests, and workflow against the docs
- compare the user-facing explanation in `README.md` against actual CLI/UI behavior
- look for drift, shortcuts, or language that violates the current project direction
- look for cases where implementation stopped at the user-visible request but left obvious foundational
  work undone
- treat this as an execution review, not as a doc-only review

### 6. Correct drift before summarizing

If the answer to review question 1 is "no", do not just mention the mismatch.
Correct it before finishing whenever feasible.

Examples:

- if the implementation drifted away from the design decisions stated in `DEVELOPMENT.md`, refactor back
  toward them (e.g. restore state-first ordering or atomic writes)
- if the code stopped short of the testing bar implied by `DEVELOPMENT.md`, finish the missing Vitest /
  Supertest coverage
- if the work used disposable-demo framing that conflicts with the current project posture, rewrite the
  affected project-facing docs
- if `README.md` drifted from actual CLI flags, Web UI behavior, or the supported-agents list, update it
- if the turn only handled the surface request but skipped obvious enabling work, finish that enabling
  work before closing

Only leave drift uncorrected if:

- the user explicitly constrained scope
- the correction would require a major new decision from the user
- the correction is blocked by missing information or an external dependency

In those cases, call out the blocker clearly in the final response.

### 7. `DEVELOPMENT.md` update rules

Update `DEVELOPMENT.md` when the turn changed current project reality, for example:

- run, test, build, or dev commands changed
- runtime architecture or module boundaries changed (`src/core`, `src/server`, `src/cli`, `src/web`)
- a new key design decision was made or an existing one changed
- new systems, data domains, routes, or workflows were added
- the supported-agents set or the state/config file model changed
- known blockers, caveats, or next steps changed

Do not update it for trivial wording-only turns that leave project state unchanged.

### 8. `README.md` update rules

Update `README.md` only when the user-facing surface changed, for example:

- a CLI command, flag, or its output changed or was added/removed
- install / build / link instructions changed
- Web UI entry point or port changed
- the supported-agents list changed

Do not update `README.md` for purely internal refactors, test-only changes, or invisible implementation
cleanup.

### 9. Edit with separation discipline

Keep the two documents distinct:

- `DEVELOPMENT.md` should be practical, current, and implementation-facing (contributors)
- `README.md` should be the user-facing explanation of the tool (people installing/using it)
- both should stay focused on the skills-ui tool itself, not AI tooling or personal local setup

When editing:

- remove stale statements instead of appending contradictions
- prefer short factual updates over long changelog-style notes
- keep commands copy-pasteable
- keep "next steps" aligned with the current codebase
- keep `README.md` aligned with actual CLI/UI behavior and current terminology
- ignore changes that came only from `.gitignore`d local tooling or build output paths

### 10. Mention the result in the final response

Before ending the turn, explicitly say one of these:

- completed explicitly requested todolist items `X, Y, Z`
- reviewed against `DEVELOPMENT.md` / `README.md`, no correction needed
- reviewed and corrected drift in `X`
- docs updated, with a short reason
- docs checked, no update needed

Do not silently skip the review pass or the doc-sync pass.

## Practical Heuristics

Use these heuristics to avoid unnecessary churn:

- If code landed but skipped the testing/closure bar implied by `DEVELOPMENT.md`, keep going and finish
  the loop (run `npm test`, add missing coverage).
- If the user gave product or UX direction but not the engineering breakdown, infer the missing
  groundwork and implement it unless a product decision is blocked.
- If the implementation contradicts a stable design decision in `DEVELOPMENT.md`, prefer correcting the
  code over editing the rule away unless the intended direction truly changed.
- If the next logical step is small and concrete, mention it or put it into `.DEVELOPMENT/TODOLIST.md`
  only when the user requested backlog maintenance; do not execute it without explicit permission.
- If the code changed but the reader of `DEVELOPMENT.md` would behave the same, the doc may not need
  editing.
- If the turn changed a CLI command, a new route, a new core module, or a new architectural boundary,
  `DEVELOPMENT.md` probably does need editing.
- If the turn changed how a user installs or drives the tool, `README.md` probably does need editing.
- If the turn only changed AI tool configs, local IDE files, build output, or other ignored local paths,
  neither document should be updated.

## Minimal Close-Out Checklist

When this skill is explicitly invoked, do this in order:

1. Re-read `DEVELOPMENT.md`
2. Re-read `README.md`
3. Write `.DEVELOPMENT/log/log-YYYY-MM-DD-HHMMSS.md`
4. Update only the stale project doc(s)
5. Review the turn against the applicable project docs
6. Correct any feasible drift
7. State in the final reply what was reviewed, corrected, and updated

Run `$suggested-todolist` or execute `.DEVELOPMENT/TODOLIST.md` items only when the user explicitly
requested that todolist follow-through.
