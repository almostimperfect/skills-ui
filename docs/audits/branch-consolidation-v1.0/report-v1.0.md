# Branch Consolidation Audit v1.0

Date: 2026-07-20
Integration branch: `development`

## Outcome

The repository has one current integration line. `development` remains the daily integration branch, local `main` now matches `origin/main`, and neither historical issue-resolution branch needs a Git merge. The only still-relevant capability missing from `development`—explicitly gated real-network source tests—was ported into the current test architecture.

No historical remote branch was deleted. They remain available for audit until branch deletion is separately authorized.

## Branch map

| Branch | Head at audit | Relationship to `development` | Decision |
| --- | --- | --- | --- |
| `development` / `origin/development` | `511ab27` before this consolidation commit | Current daily integration line | Continue development here |
| `main` / `origin/main` | `270708f` | Released snapshot created by PR #3; current `development` has 19 later commits | Local `main` fast-forwarded to the remote head; no merge into `development` |
| `development-open-issues-resolution` / remote | `5aeebd6` | Ancestor of `development`; 20 commits behind, 0 unique commits | Already merged by PR #2; no action |
| `open-issues-resolution` / remote | `f853c7f` | Diverged from the old `main`: 8 branch-only commits while `development` has 26 commits absent there | Do not merge wholesale; selectively port the missing network tier |

The `development...origin/main` count was `19 / 1`. The one main-only object is PR #3's merge commit; its source tree is an older `development` snapshot, not newer product content that must be brought back.

## Pull requests

| PR | Route | Result | Meaning |
| --- | --- | --- | --- |
| #1 | `open-issues-resolution` → `main` | Closed, not merged | Historical attempt; closing it did not transfer its network test tier |
| #2 | `development-open-issues-resolution` → `development` | Merged | Development-specific issue fixes are already present |
| #3 | `development` → `main` | Merged and approved | Published an earlier integration snapshot to `main` |

## Why the divergent branch was not merged

The eight commits unique to `open-issues-resolution` combine four different kinds of work:

1. an older Docker/Playwright harness and real-network tests;
2. issue fixes against the pre-inventory architecture;
3. superseded planning and acceptance documents under the former `.DEVELOPMENT` structure;
4. local development-assistant Skills that refer to that former structure.

Current `development` independently implements the business protections from that branch—state validation, rejection of false-success CLI operations, safe mutation feedback, partial-failure reporting—and then adds the inventory model, product remediation, and bilingual interface. A wholesale merge or cherry-pick would therefore duplicate tests, conflict with newer routes and state types, and revive obsolete documentation and assistant conventions.

The network tier was the exception: current Docker tests were isolated but only used local fixtures or mocked HTTP operations. Its behavior was ported and adapted rather than cherry-picked.

## Consolidated content

The current test harness now provides:

- default `@network` exclusion in Playwright;
- a normal E2E container run with `--network=none`;
- an explicit `--network` runner and `test:e2e:network` npm entry;
- no `--network=host`, bind mount, or volume mount;
- isolated temporary HOME directories for CLI downloads;
- real Git URL, owner/repository shorthand, multi-Skill selection, API install, and clean failure coverage.

The implementation deliberately does not execute downloaded Skill contents. It verifies discovery and installation behavior only, then destroys the container and temporary homes.

## Verification

- Docker unit tests: 15 files, 83 tests passed.
- Default Docker Playwright: 24 tests passed; network cases excluded; test container had no network.
- Explicit Docker network Playwright: 30 tests passed, including 6 `@network` cases.
- Local `main`: synchronized from `cfe17dc` to `270708f`, with no discarded local-only commits.
- `development-open-issues-resolution`: verified as an ancestor of `development`.

## Remaining historical branches

Both issue-resolution branches are now historical only. They can be deleted locally and remotely later to reduce visual clutter, but this audit intentionally preserves them because branch deletion is a separate repository mutation and is not required to consolidate their useful content.
