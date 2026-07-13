# Development Guide

## Requirements

- Node.js 18+

## Setup

```bash
git clone https://github.com/your-org/skills-ui
cd skills-ui
npm install
```

## Commands

```bash
npm test             # run all tests
npm run build        # compile server TS + bundle web

npm run dev:server   # backend on http://localhost:3456
npm run dev:web      # Vite dev server on http://localhost:5173
```

## Isolated testing (Docker)

The runtime writes to real, home-directory paths — `~/.skills-ui/{config,state}.json`, the global
`~/.agents/skills` store — and spawns the bundled `skills` binary. To exercise the code without any of
that touching your machine, run the suite inside a throwaway container. The host `$HOME` is never
mounted, so everything the code writes lives inside the container and is discarded on exit. You don't
even need a local `node_modules` — deps are installed fresh via `npm ci` inside the image.

```bash
npm run test:docker         # build the image + run the Vitest suite, then discard the container
npm run test:docker:shell   # same image, but drop into a shell for interactive debugging
```

Both wrap `Dockerfile.test` (build context filtered by `.dockerignore`). Any new test must keep the
same isolation discipline: use `os.tmpdir()` for real filesystem work and mock `child_process` /
the `src/core/*` modules — never point production code at a real home-directory path.

## E2E tests & Web exposure (Docker-only — host never needs Node)

Functional + Chromium UI automation lives in [`e2e/`](e2e/README.md) and runs entirely inside
`Dockerfile.e2e` (Playwright base image: Node + Chromium in image layers). The host needs Docker only.

```bash
sh e2e/scripts/run-e2e.sh              # offline tier; report extracted to e2e/output/
sh e2e/scripts/run-e2e.sh --network    # + @network tier (real GitHub skill sources)
sh e2e/scripts/show-report.sh          # HTML report at http://localhost:9323
sh e2e/scripts/serve-docker.sh --demo  # Web UI at http://localhost:3456, seeded demo store
```

Hard isolation rules (binding; full list in `e2e/README.md`): zero `-v`/`--mount` flags on any
`docker run`; COPY-only image builds; artifacts leave containers only via `docker cp` into
`e2e/output/` after exit; unique `$HOME` per Playwright worker; network tier fetches skill sources
only — dependency installation happens exclusively at image build time.

The current offline acceptance baseline is **71 passed, 0 skipped, 0 failed** (2026-07-13). Its
current interaction contract is documented in
[`docs/testing/functional-interaction-test-design-v1.1.md`](docs/testing/functional-interaction-test-design-v1.1.md).

## Stack

| Layer    | Technology |
|----------|-----------|
| Backend  | Node.js 18, TypeScript (ESM), Express 4 |
| Frontend | React 19, Vite 6, Tailwind CSS 3, TanStack Query 5, React Router 7 |
| Testing  | Vitest 2 + Supertest + Playwright 1.49 (Docker) |

## Project Structure

```
src/
  cli/              # Commander CLI (entry: src/cli/index.ts)
  core/             # Pure business logic — no Express, no React
    skills-cli.ts   # Spawns the bundled `skills` binary
    state.ts        # Per-project symlink manager + state.json
    file-store.ts   # Atomic JSON writes (write-to-tmp + rename)
    projects.ts     # Project registry (config.json)
    metadata.ts     # SKILL.md frontmatter parser
    constants.ts    # SUPPORTED_AGENTS, paths, AGENT_DIRS
  server/           # Express app
    index.ts        # createApp() — mounts routers + SPA fallback
    routes/         # agents / skills / projects
  web/              # React SPA (built to dist/web/)
tests/
  core/             # Unit tests
  server/           # HTTP integration tests (supertest)
```

## Key Design Decisions

**State-first ordering** — `state.ts` always writes `state.json` *before* modifying symlinks. If the process crashes mid-operation, the persisted state reflects the intended final state, so a restart is self-healing.

**Atomic writes** — `file-store.ts` writes JSON to a random `.tmp` file then renames it into place. A serial per-path queue prevents concurrent write races.

**Bundled `skills` binary** — The `skills` package is a regular `dependency`, so `node_modules/.bin/skills` is always available after `npm install`. Routes and CLI always call it directly; `npx skills` is never used (it may resolve a different version from PATH).

**Agent and project validation** — Valid agent IDs are defined once in `SUPPORTED_AGENTS`
(`constants.ts`). Enable/disable operations on both CLI and API require a registered project, a
supported agent managed by that project, and an installed canonical skill.

**Path validation** — CLI `project add` and `POST /api/projects` reject relative paths, missing paths,
and non-directory paths before handing off to the registry.

**Actionable Web errors** — `src/web/api.ts` converts failed responses into typed `ApiError` values
while preserving human-readable server messages. Mutations surface errors in visible alerts;
destructive list actions require confirmation, and bulk actions report partial-failure counts.
