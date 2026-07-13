---
name: dev-chronicle
description: Record durable skills-ui project history as versioned development chronicle entries under .DEVELOPMENT/chronicle. Use when the user asks to record development history, retrospectives, milestones, key fixes, important feature updates, design turns, or validation milestones for later explaining the project; also use after skills-ui work that produced a major feature, important bug/UX fix, structural refactor, release milestone, or testing milestone worth future retrospection.
---

# Dev Chronicle

## Purpose

Use this skill to create long-term historical records for the skills-ui project.
The chronicle is for future retrospectives and project storytelling, not routine turn close-out.

Keep the separation clear:

- Commit history records exact code changes.
- `.DEVELOPMENT/log/` records concise execution snapshots.
- `.DEVELOPMENT/ISSUES.md` records durable defects, tech-debt, and UX gaps.
- `.DEVELOPMENT/TODOLIST.md` records forward work.
- `.DEVELOPMENT/chronicle/` records why an event mattered and how future readers should understand it.

## Required Reading

Before writing an entry, read enough evidence to ground the story:

- latest relevant commit summary: `git log --oneline -n 5` and `git show --stat --oneline <commit>` when available
- latest relevant `.DEVELOPMENT/log/log-*.md`
- `DEVELOPMENT.md` (repo root)
- `README.md` when user-facing behavior may have changed
- `.DEVELOPMENT/ISSUES.md` and `.DEVELOPMENT/TODOLIST.md` for durable leftovers and scheduled work
- relevant test output, PR descriptions, or review notes
- files materially changed by the event when the documents do not explain the change well enough

Do not invent process history. If evidence is missing, say so in the entry.

## Should This Become A Chronicle Entry?

Write an entry only when at least one is true:

- A user-facing feature, command, route, or UI screen reached a meaningful milestone.
- A key bug, correctness issue (e.g. state/symlink or atomic-write hazard), UX gap, or production risk
  was fixed.
- The project changed direction, constraints, architecture, validation strategy, or release posture.
- A test run or review created durable confidence or exposed a memorable defect.
- The event has useful story material: conflict, turning point, tradeoff, lesson, or representative detail.

Do not write an entry for small routine fixes, formatting, generated build output, local AI/editor
setup, minor docs cleanup, or ordinary backlog maintenance.

## Workflow

1. Ensure `.DEVELOPMENT/chronicle/entries/` exists (create it if missing). This skill is self-contained;
   if the repo does not already have a chronicle guide or template, use the **Entry Structure** below.
2. Gather evidence from the required reading list.
3. Decide the event type:
   `bugfix`, `feature`, `milestone`, `design-shift`, `crisis`, `validation`, or `release-candidate`.
4. Create a new file under `.DEVELOPMENT/chronicle/entries/` named
   `YYYY-MM-DD-short-event-name-v1.0.md`.
5. Fill every section of the Entry Structure with concise, evidence-backed prose.
6. Link, do not duplicate, commits, logs, issues, todolist items, and test reports.
7. If the entry identifies actionable unresolved work, ensure it is also recorded in
   `.DEVELOPMENT/ISSUES.md` or `.DEVELOPMENT/TODOLIST.md`.

Always create a new versioned file. If revising an existing entry, copy it to a new version such as
`...-v1.1.md` and preserve the old version.

## Entry Structure

Use these sections in each chronicle entry:

- **Title / Date / Type** — `YYYY-MM-DD`, one of the event types above.
- **Summary** — 2–4 sentences: what happened and why it mattered now.
- **Context** — the state of the project before the event; what pressure or goal prompted it.
- **What changed** — the concrete change for users, contributors, tests, or architecture.
- **Tension / tradeoff / decision** — the conflict, failure, or judgment call that shaped it.
- **Validation** — how it was confirmed (`npm test`, `npm run build`, manual CLI/UI check, review).
- **Evidence** — links to commits, `.DEVELOPMENT/log/` entries, issues, todolist items, PRs.
- **For the future** — the lesson or story material worth retaining.

## Writing Standard

Entries should be readable without opening the code diff.
Write enough context for a future collaborator to understand:

- what happened
- why it mattered now
- what tension, failure, tradeoff, or decision shaped it
- what changed for users, tools, tests, or future development
- how it was validated
- what evidence supports the account
- what story material should be retained

Keep tone factual and specific. Avoid making every task sound like a milestone.
