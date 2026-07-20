# Real Network Source Smoke Test v1.0

## Purpose

This tier verifies that the product can still install Skills from real remote repositories. It is intentionally separate from the deterministic suite because upstream repositories and network availability can change independently of this project.

## Commands

Default deterministic E2E, with the test container's network disabled:

```sh
sh e2e/scripts/run-e2e.sh
```

Explicit real-network acceptance:

```sh
sh e2e/scripts/run-e2e.sh --network
```

When Node/npm is available in the invoking environment, the equivalent package script is:

```sh
npm run test:e2e:network
```

## Security boundary

- Docker is the only host prerequisite for the shell entry point.
- The runner has no bind mounts or Docker volumes.
- `.dockerignore` excludes environment files, Git metadata, agent configuration, local stores, logs, reports, and dependency directories from the build context.
- The default E2E container uses `--network=none`.
- Only `--network` adds ordinary Docker bridge connectivity; host networking is not used.
- CLI download tests receive a minimal environment containing only `CI`, a temporary `HOME`, and the container `PATH`.
- Downloaded Skills are inspected as data and are not executed.
- Temporary homes and the container filesystem are destroyed after the run.

The image build itself may access package registries to run the lockfile-controlled `npm ci`. This is separate from runtime source tests and still occurs inside Docker.

## Current cases

| Case | Source or action | Contract checked |
| --- | --- | --- |
| Opt-in guard | `E2E_NETWORK=1` | Network cases cannot run accidentally in the default tier |
| Git URL | `https://github.com/op7418/Humanizer-zh.git` | A single-Skill repository installs through `skills-ui add` |
| Shorthand | `almostimperfect/codex-ppt-skills` | `owner/repository` syntax remains supported |
| Selection | `https://github.com/anthropics/skills`, `skill-creator` | The bundled Skills CLI can select one Skill from a multi-Skill repository |
| HTTP API | `POST /api/skills` with Humanizer-zh | The server route performs a real install and returns `201` |
| Expected failure | nonexistent owner/repository | The CLI exits with an actionable error and no stack trace |

The first restored run also confirmed that the installed identifier is normalized to `humanizer-zh`, rather than preserving the repository display capitalization.

## Historical source record

The unmerged `open-issues-resolution` branch had recorded these additional probes:

- `https://github.com/anthropics/claude-code` with `Skill Development`;
- `https://definitely-unreachable-host-9x9.invalid/repo.git`;
- `https://github.com/op7418/guizang-ppt-skill` through the API.

They were not retained as required smoke cases: the Claude repository layout is externally mutable, the invalid-host case duplicates the clean failure contract, and the second API repository duplicates the real API installation path. The history remains available in commit `0346b50` if those probes are useful for a one-off investigation.

## Interpretation

A failure in this tier does not automatically mean the application regressed. First distinguish among DNS/connectivity failure, upstream repository layout or naming changes, and a product/CLI contract failure. The default 24-test tier remains the deterministic regression gate; the network tier is an explicit integration acceptance gate.
