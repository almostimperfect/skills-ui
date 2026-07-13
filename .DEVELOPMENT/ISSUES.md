# skills-ui — Issue Registry

Durable defects, tech debt, UX gaps, and optimization needs. Forward work lives in
[`TODOLIST.md`](./TODOLIST.md). IDs are never reused.

## Open / Scheduled

### UX-012 — CLI cannot unregister a project
- **severity:** low
- **status:** open
- **discovered:** 2026-07-09
- **where:** `src/cli/commands/` has `project add` and `projects`, but no project removal command.
- **how found:** coverage-gap review in the functional interaction test design.

### UX-013 — Project rename and agent editing have no Web UI
- **severity:** low
- **status:** open
- **discovered:** 2026-07-09
- **where:** `PATCH /api/projects/:path` and `src/web/api.ts#updateProject` exist, but no page exposes them.
- **how found:** API-to-Web interaction coverage review.

### UX-014 — Add command cannot select one skill from a multi-skill source
- **severity:** medium
- **status:** open
- **discovered:** 2026-07-09
- **where:** `src/cli/commands/add.ts` does not pass an upstream `--skill` selection.
- **how found:** network-tier test design against multi-skill repositories.

## Resolved (history)

### 2026-07-13 — Open-issue resolution milestone

The 15 issues that were open or scheduled at the start of the resolution pass were closed by commits
`5e90092`, `9ace030`, `c245cd1`, and `12b05ad`. Their desired behaviors are active E2E tests; the
offline suite finished at **71 passed, 0 skipped, 0 failed**.

| ID | Severity | Resolution |
|---|---|---|
| PERF-001 | medium | Status and matrix routes read each project's disabled map once, then compute in memory. |
| DEBT-001 | medium | CLI and API reject unregistered projects, unsupported agents, and agents not managed by a project. |
| UX-001 | low | Unknown skill detail returns 404; Web renders a not-found state via typed `ApiError`. |
| DEBT-002 | low | `state.enable()` verifies that the canonical skill exists before mutating state or symlinks. |
| DEBT-004 | trivial | Removed the unreachable metadata fallback. |
| UX-002 | low | Missing Web build returns 503 with `Run npm run build` guidance. |
| UX-003 | medium | CLI project registration requires an existing absolute directory. |
| UX-004 | high | Skill and project removal require confirmation before DELETE. |
| UX-005 | high | Project add/remove and skill remove failures render visible alerts. |
| UX-006 | medium | API errors extract the server's human-readable message instead of exposing raw HTTP text. |
| UX-007 | medium | Add-skill and add-project forms support autofocus, Escape, and Enter submit. |
| UX-008 | low | Dashboard renders a distinct unavailable/error state. |
| UX-009 | medium | Failed per-agent toggles render visible feedback. |
| UX-010 | medium | Bulk actions disable controls while pending and report the number of partial failures. |
| UX-011 | medium | CLI and API removal reject a skill that is not installed. |

### BUG-001 — `listSkills()` parsing against skills@1.4.5
- **severity:** high
- **status:** resolved (2026-07-10)
- **where:** `src/core/skills-cli.ts`
- **resolution:** format-aware ANSI-safe parsing, empty-store normalization, description enrichment,
  unit regressions, and E2E coverage.

### DEBT-003 — Fragile `skills list` stdout parsing
- **severity:** low
- **status:** resolved (2026-07-10), superseded and closed with BUG-001.
- **where:** `src/core/skills-cli.ts`
- **resolution:** the BUG-001 parser rewrite replaced the substring-based parser.
