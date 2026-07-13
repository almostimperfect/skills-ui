# skills-ui — Functional & Interaction Test Design v1.1

**Version:** 1.1

**Date:** 2026-07-13

**Status:** automated acceptance baseline
**Supersedes:** [`functional-interaction-test-design.md`](./functional-interaction-test-design.md),
which is preserved as the original v1.0-era design record.

## 1. Purpose

This revision records the acceptance contract after resolving the 15 findings that were open or
scheduled at the start of the 2026-07-13 pass. The detailed personas, manual procedures, case
descriptions, and usability rubric remain in the preserved original. This file is the current status
and automation map.

The acceptance lens remains:

- feedback for every mutation;
- confirmation for destructive Web actions;
- human-readable errors;
- distinct loading, empty, not-found, and error states;
- matching validation across CLI and API;
- keyboard affordances and truthful success reporting.

## 2. Isolation and execution

The canonical acceptance command is:

```bash
sh e2e/scripts/run-e2e.sh
```

It builds and runs the real CLI, Express server, and production Web bundle in Docker. Test containers
receive no host mounts. Each Playwright worker gets a disposable in-container `$HOME`, and artifacts
leave only through `docker cp` after execution. The host needs Docker only.

The opt-in external-source tier is:

```bash
sh e2e/scripts/run-e2e.sh --network
```

## 3. Acceptance result

On 2026-07-13, the offline suite completed with:

- **71 passed**
- **0 skipped**
- **0 failed**

This means every registered desired-behavior `fixme` from the original issue-resolution scope is now
an active passing test; obsolete broken-behavior truth pins were removed.

## 4. Resolved finding map

| Finding | Current acceptance behavior | Automated surface |
|---|---|---|
| PERF-001 | One disabled-map read per project status/matrix calculation | API/unit regression |
| DEBT-001 | Registered project and managed-agent validation | CLI + API |
| UX-001 | Unknown skills return/render not found | API + Web |
| DEBT-002 | Enabling an uninstalled skill cannot create a dangling link | Core + CLI |
| DEBT-004 | Dead metadata fallback removed | API regression |
| UX-002 | Missing Web build returns actionable 503 | Server integration |
| UX-003 | CLI requires an existing absolute project directory | CLI |
| UX-004 | Skill/project removal requires confirmation | Web |
| UX-005 | Mutation failures are visible | Web |
| UX-006 | Server error messages are human-readable | Web |
| UX-007 | Add forms support autofocus, Escape, and Enter | Web |
| UX-008 | Dashboard errors differ from loading | Web |
| UX-009 | Toggle failures are visible | Web |
| UX-010 | Bulk progress and partial failures are visible | Web |
| UX-011 | Missing-skill removal is rejected | CLI + API |

## 5. Current case organization

- `e2e/specs/cli/`: install, remove, list, enable/disable, project registration, serve validation.
- `e2e/specs/api/`: response and validation contracts.
- `e2e/specs/web/`: Dashboard, Skills, Skill Detail, Projects, Project Detail, keyboard interaction.
- `e2e/specs/scenarios/`: store shapes, edits, versions, symlinks, and broken-store resilience.
- `e2e/specs/network/`: real external sources, excluded from the offline baseline.

## 6. Remaining product gaps

These were documented as coverage gaps in the original design and were not among its 15 registered
open issues:

- CLI project unregister parity ([UX-012](../../.DEVELOPMENT/ISSUES.md));
- Web controls for project rename/managed agents ([UX-013](../../.DEVELOPMENT/ISSUES.md));
- selecting one skill from a multi-skill source ([UX-014](../../.DEVELOPMENT/ISSUES.md)).

They are forward product work, not skipped acceptance failures in the current 71-case baseline.
