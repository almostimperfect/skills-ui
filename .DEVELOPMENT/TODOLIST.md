# skills-ui — Prioritized Todolist

Forward execution backlog after the 2026-07-13 open-issue resolution milestone. Known product gaps
are tracked in [`ISSUES.md`](./ISSUES.md).

## Top 3 Next Tasks

### 1. Add CLI project unregister
- **priority:** P1
- **type:** feature
- **why now:** project lifecycle is asymmetric between CLI and Web; users must open the UI to unregister.
- **definition of done:** add `skills-ui project remove <absolute-path>`, confirmation/output semantics,
  state cleanup, unit coverage, and isolated E2E coverage.
- **status:** todo — [UX-012](./ISSUES.md)

### 2. Expose project rename and managed-agent editing in Web
- **priority:** P1
- **type:** feature
- **why now:** the API supports updates, but the shipped Web workflow cannot use them.
- **definition of done:** accessible edit controls call `PATCH /api/projects/:path`, validate agents,
  show pending/error/success feedback, and have Playwright acceptance coverage.
- **status:** todo — [UX-013](./ISSUES.md)

### 3. Establish scale baselines for list and matrix endpoints
- **priority:** P1
- **type:** performance
- **why now:** PERF-001 removed repeated state-file reads, but no benchmark protects that improvement as
  project, skill, and agent counts grow.
- **definition of done:** deterministic benchmark fixtures cover representative and stress sizes,
  record median request times and state-file read counts, and document a regression threshold.
- **status:** todo

## Backlog

### Add `--skill` selection for multi-skill sources
- **priority:** P2
- **type:** feature
- **why now:** skills-ui cannot express a supported upstream install workflow.
- **definition of done:** CLI and Web can select a named skill without breaking whole-repository adds;
  local-fixture and network-tier tests cover both paths.
- **status:** todo — [UX-014](./ISSUES.md)

### Run Docker acceptance in GitHub Actions
- **priority:** P1
- **type:** testing
- **why now:** the 71-case offline acceptance suite is authoritative but currently depends on a manual run.
- **definition of done:** CI runs Vitest/Supertest and offline Playwright in Docker, publishes failure
  artifacts, and never mounts or uploads host secrets.
- **status:** todo

### Add focused Web API-client unit tests
- **priority:** P2
- **type:** testing
- **why now:** E2E covers user-visible behavior, while JSON/plain-text/empty error-body parsing can be
  checked faster and more exhaustively at the client boundary.
- **definition of done:** tests cover successful JSON, JSON `{error}`, plain text, empty error responses,
  and `ApiError.status` without replacing E2E acceptance.
- **status:** todo

## Notes

- The prior 15 open/scheduled issues are resolved and retained in `ISSUES.md` history.
- Offline acceptance baseline: 71 passed, 0 skipped, 0 failed on 2026-07-13.
- Network-tier tests remain opt-in because they depend on external GitHub sources.
