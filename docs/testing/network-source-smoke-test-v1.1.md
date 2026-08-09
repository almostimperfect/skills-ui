# Real Network Source Smoke Test v1.1

## Purpose

This tier verifies that the product can install Skills from real remote repositories. It stays separate from the deterministic suite because network availability and upstream repositories can change independently of this project.

## Commands

Default deterministic E2E, with runtime network disabled:

```sh
sh e2e/scripts/run-e2e.sh
```

Explicit real-network acceptance:

```sh
sh e2e/scripts/run-e2e.sh --network
```

When Node/npm is available on the invoking host, the equivalent package command is:

```sh
npm run test:e2e:network
```

## Security boundary

- Docker is the only host prerequisite for the shell entry point.
- The runner uses no bind mounts, Docker volumes, host networking, or host Skill directories.
- `.dockerignore` excludes environment files, Git metadata, agent configuration, private development-control material, local stores, logs, reports, and dependency directories from the build context.
- The default E2E container uses `--network=none`.
- Only the explicit `--network` mode adds ordinary Docker bridge connectivity.
- CLI download tests receive a minimal environment containing only `CI`, a temporary `HOME`, and the container `PATH`.
- Downloaded Skills are inspected as data and are not executed.
- Temporary homes and the container filesystem are destroyed after the run.

The image build may access the npm registry for the lockfile-controlled `npm ci`. That build step is separate from runtime source tests and still occurs inside Docker.

## Current cases

| Case | Source or action | Contract checked |
| --- | --- | --- |
| Opt-in guard | `E2E_NETWORK=1` | Network cases cannot run accidentally in the default tier |
| Git URL | `https://github.com/op7418/Humanizer-zh.git` | A single-Skill repository installs through `skills-ui add` |
| Shorthand | `op7418/Humanizer-zh` | `owner/repository` syntax remains supported |
| Selection | `https://github.com/anthropics/skills`, `skill-creator` | The bundled Skills CLI selects one Skill from a multi-Skill repository |
| HTTP API | `POST /api/skills` with Humanizer-zh | The server route performs a real install and returns `201` |
| Expected failure | nonexistent owner/repository | The CLI exits with an actionable error and no stack trace |

## Interpretation

A failure in this tier does not automatically mean the application regressed. First distinguish DNS/connectivity failure, an upstream repository layout or naming change, and a product/CLI contract failure. The default deterministic tier remains the regression gate; the network tier is an explicit integration acceptance gate.
