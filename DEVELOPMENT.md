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

## Stack

| Layer    | Technology |
|----------|-----------|
| Backend  | Node.js 18, TypeScript (ESM), Express 4 |
| Frontend | React 19, Vite 6, Tailwind CSS 3, TanStack Query 5, React Router 7 |
| Testing  | Vitest 2 + Supertest |

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

**Agent whitelist** — Valid agent IDs are defined once in `SUPPORTED_AGENTS` (`constants.ts`). API routes validate `agent` against this list and return 400 for unknown values.

**Path validation** — `POST /api/projects` rejects relative paths and paths that don't exist on disk before handing off to the registry.
