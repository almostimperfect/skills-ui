# Open-Issue Acceptance Milestone

- **Date:** 2026-07-13
- **Type:** validation
- **Version:** 1.0

## Summary

skills-ui converted a Docker/Playwright test plan into a complete passing acceptance baseline and used
it to close 15 known correctness, performance, and interaction issues. The offline suite progressed
from documented skips to 71 passing cases with no skipped desired behavior.

## Context

The project had a working CLI, API, and Web UI, plus findings collected through source review and a
manual interaction design. Several operations could report false success, Web mutations often failed
silently, and test execution needed to avoid touching the developer's real HOME or skill store.

## What changed

Core and API invariants now prevent dangling skills and unknown project/agent state. CLI commands
validate paths and reject missing resources. The Web UI confirms destructive actions, parses useful
server messages, supports keyboard-driven forms, distinguishes errors, and reports partial bulk
failures. Docker-only unit/integration/E2E workflows exercise the built product with disposable homes.

## Tension / tradeoff / decision

The user preferred direct work on `main`, but repository protection rejected direct pushes. The work
therefore stayed on one plainly named branch (`open-issues-resolution`) with a draft PR, avoiding both
an unnecessary baseline branch and extra worktrees. Test isolation was retained as a supported option,
not imposed on ordinary development.

## Validation

The final functional milestone run reported 71 passed, 0 skipped, and 0 failed in the offline
Playwright suite. Focused Vitest/Supertest checks and production TypeScript/Vite builds also passed in
Docker. Final network-tier and security checks are recorded in the accompanying development log/PR.

## Evidence

- Commits: `5e90092`, `9ace030`, `c245cd1`, `12b05ad`
- Development log: [`log-2026-07-13-052344.md`](../../log/log-2026-07-13-052344.md)
- Issue history: [`ISSUES.md`](../../ISSUES.md)
- Acceptance design: [`functional-interaction-test-design-v1.1.md`](../../../docs/testing/functional-interaction-test-design-v1.1.md)
- Draft PR: <https://github.com/almostimperfect/skills-ui/pull/1>

## For the future

Desired-behavior tests should replace defect truth pins as soon as a fix lands. A green suite is most
useful when it contains no skipped registered findings and when its filesystem boundary is explicit
enough that contributors can run it without risking real user state.
