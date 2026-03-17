# skills-ui Design Spec

## Overview

skills-ui is a visual management layer built on top of [vercel-labs/skills](https://github.com/vercel-labs/skills). It adds a Web UI, enable/disable state management, and project-level skill configuration. The underlying `skills` CLI handles installation, removal, updates, and agent adapters for 42+ applications.

## Core Concept

`vercel-labs/skills` provides: install, uninstall, update, search, agent adapters, symlink management, lock files.

skills-ui adds:
- **Web dashboard** for visual skill management
- **Enable/disable toggle** per project per agent (skills CLI only has install/uninstall)
- **Project registry** tracking which projects use which skills
- **Unified view** across multiple projects and agents

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Web UI (React)                 │
│         served by `skills-ui serve`              │
└──────────────────────┬──────────────────────────┘
                       │ HTTP API
┌──────────────────────┴──────────────────────────┐
│              API Server (Express)                │
│       embedded in CLI, started by `serve`        │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│                 Core Library                     │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────┐ │
│  │ Skills CLI   │ │ State Manager│ │ Project   │ │
│  │ Wrapper      │ │ (enable/     │ │ Registry  │ │
│  │ (child_proc) │ │  disable)    │ │           │ │
│  └─────────────┘ └──────────────┘ └───────────┘ │
└─────────────────────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │   vercel-labs/skills    │
          │   (npm dependency)      │
          └─────────────────────────┘
```

### Three Layers

1. **Core Library** (`src/core/`) — Pure logic, no UI. Three modules:
   - **Skills CLI Wrapper** — Calls `npx skills <command>` via `child_process.execFile`. Parses output. Functions: `add()`, `remove()`, `list()`. Note: function names match the underlying `skills` CLI commands (`add`/`remove`, not `install`/`uninstall`). `update()`, `find()`, `check()` are deferred to post-v1.
   - **State Manager** — Manages enable/disable state. When a skill is "disabled" for an agent in a project, the symlink is removed from that agent's directory but the skill remains installed in `.agents/skills/`. Re-enabling recreates the symlink. State stored in `~/.skills-ui/state.json`. All writes use atomic write-then-rename and a serialized write queue to prevent concurrent corruption.
   - **Project Registry** — Tracks registered project paths and their per-agent skill configurations. Stored in `~/.skills-ui/config.json`. Same atomic write strategy as state manager.

2. **CLI** (`src/cli/`) — Thin wrapper calling core library:
   - `skills-ui add <source>` — Delegates to `skills add`
   - `skills-ui remove <name>` — Delegates to `skills remove`
   - `skills-ui enable <name> --project <path> --agent <agent>` — Creates symlink for agent
   - `skills-ui disable <name> --project <path> --agent <agent>` — Removes symlink, preserves install
   - `skills-ui list [--project <path>]` — Shows skills with enable/disable state
   - `skills-ui projects` — Lists registered projects
   - `skills-ui project add <path>` — Registers a project
   - `skills-ui serve [--port <port>]` — Starts Web UI

3. **Web UI** (`src/web/`) — React SPA, built to static files, served by CLI's `serve` command:
   - **Dashboard** — Overview of installed skills, registered projects, quick actions
   - **Skills List** — Browse, search, install/uninstall, view details
   - **Project View** — Select a project, see which skills are enabled per agent, toggle on/off
   - **Skill Detail** — Metadata (from frontmatter), source, which projects use it, per-agent status

## Data Model

### Config (`~/.skills-ui/config.json`)

```json
{
  "projects": [
    {
      "path": "/Users/me/my-project",
      "name": "my-project",
      "agents": ["claude-code", "codex"]
    }
  ]
}
```

- **`path`** is the unique identifier for a project (used as `:projectPath` in API routes, URL-encoded)
- **`name`** is auto-derived from `path` basename at registration time; user can override via API/CLI
- **`agents`** lists which agents the user wants to manage for this project. Auto-detected from existing agent directories (e.g., if `.claude/` exists, `claude-code` is included) at registration time; user can add/remove manually.

### State (`~/.skills-ui/state.json`)

Tracks the enable/disable state per project per agent. Only "disabled" entries are stored — if a skill is installed and not in the disabled list, it is considered enabled (default-enabled convention).

```json
{
  "disabled": {
    "/Users/me/my-project": {
      "claude-code": ["tdd-workflow"],
      "codex": ["react-best-practices"]
    }
  }
}
```

### Skill Metadata

Read from installed skill's `SKILL.md` frontmatter (name, description). skills-ui does not add its own metadata files inside skill directories — all supplementary info lives in `~/.skills-ui/`.

Skill names are scoped by the `skills` CLI's own collision handling. skills-ui treats the directory name under `.agents/skills/` as the canonical unique identifier.

## Enable/Disable Mechanism

This is the core feature skills-ui adds over vercel-labs/skills.

**Add** (via `skills add`):
- Skill is downloaded to `.agents/skills/<name>/` (canonical)
- Symlinks created for all targeted agents (e.g., `.claude/skills/<name>` -> `.agents/skills/<name>`)

**Disable** (skills-ui):
1. Remove the symlink from the agent's directory (e.g., remove `.claude/skills/<name>`)
2. Leave the skill in `.agents/skills/` (still "installed")
3. Record in `state.json` that this skill is disabled for this agent in this project

**Enable** (skills-ui):
1. Recreate the symlink from agent directory to `.agents/skills/<name>`
2. Remove the disabled entry from `state.json`

**Remove** (via `skills remove`):
- Removes from `.agents/skills/` and all symlinks
- Clean up any state.json entries for this skill

**Unregister Project** (skills-ui):
- Removes project from `config.json`
- Cleans up all entries for this project path in `state.json`

## Web UI Pages

### Dashboard (`/`)
- Count of installed skills, registered projects
- Quick actions: add skill, register project

### Skills (`/skills`)
- Table/grid of all installed skills (globally)
- Each row: name, description, source, actions (remove)
- Search/filter locally installed skills
- "Add Skill" button — input: GitHub URL or local path

### Skill Detail (`/skills/:name`)
- Frontmatter metadata (name, description)
- Source (GitHub repo, local path)
- Per-project per-agent enable/disable status grid (data from `GET /api/skills/:name`)
- Skill file content preview

### Projects (`/projects`)
- List of registered projects
- Each row: name, path, agent count, skill count
- "Add Project" button

### Project Detail (`/projects/:projectPath`)
- Project path, configured agents
- Skill matrix: rows = skills, columns = agents, cells = enabled/disabled toggle
- Bulk enable/disable actions

## API Endpoints

The embedded Express server exposes:

```
GET    /api/skills                  — List installed skills with metadata
GET    /api/skills/:name            — Skill detail with per-project per-agent status
POST   /api/skills                   — Add a skill (body: { source })
DELETE /api/skills/:name            — Remove a skill
POST   /api/skills/:name/enable     — Enable for project+agent (body: { projectPath, agent })
POST   /api/skills/:name/disable    — Disable for project+agent (body: { projectPath, agent })

GET    /api/projects                — List registered projects
POST   /api/projects                — Register a project (body: { path, agents? })
PATCH  /api/projects/:projectPath   — Update a project (body: { name?, agents? })
DELETE /api/projects/:projectPath   — Unregister a project and clean up its state.json entries
GET    /api/projects/:projectPath   — Project detail with skill status matrix

GET    /api/agents                  — List supported agents (static list: claude-code, codex, antigravity, gemini, etc.)
```

Notes:
- `:projectPath` is the URL-encoded absolute path (e.g., `/api/projects/%2FUsers%2Fme%2Fmy-project`)
- `GET /api/skills/:name` returns the skill metadata plus a `status` map: `{ [projectPath]: { [agent]: "enabled" | "disabled" } }` for all registered projects
- `GET /api/projects/:projectPath` returns the project config plus a skill matrix: `{ [skillName]: { [agent]: "enabled" | "disabled" } }` for all installed skills

## Error Handling — CLI Wrapper

The skills CLI wrapper (`src/core/skills-cli.ts`) handles errors from `child_process.execFile`:

- **`skills` CLI not found**: Check if `npx skills` is available at startup. If not, the API returns 503 with a message to install: `npm install -g skills`.
- **Non-zero exit code**: Parse stderr for error message, return structured error to caller with the original exit code.
- **Timeout**: 30-second default timeout for all CLI calls. `add` commands get 120 seconds (downloads may be slow). Timeout errors return 504.
- **Parsing**: The wrapper parses `skills list` output (which outputs JSON when available, or plain text). If parsing fails, return raw output as error context.

## Tech Stack

- **Runtime**: Node.js (>=18)
- **Language**: TypeScript
- **CLI**: Commander.js
- **Web Framework**: Express (embedded API server)
- **Frontend**: React 19 + Vite (built to static files, served by Express)
- **Styling**: Tailwind CSS
- **State**: React Query for server state
- **Package**: Single npm package, `skills-ui` command

## Project Structure

```
skills-ui/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── core/                # Pure logic, no dependencies on CLI or Web
│   │   ├── skills-cli.ts    # Wrapper around vercel-labs/skills CLI
│   │   ├── state.ts         # Enable/disable state manager
│   │   ├── projects.ts      # Project registry
│   │   ├── metadata.ts      # Skill metadata parser (frontmatter)
│   │   └── types.ts         # Shared types
│   ├── cli/
│   │   ├── index.ts         # CLI entry point (commander)
│   │   └── commands/        # One file per command
│   ├── server/
│   │   ├── index.ts         # Express app setup
│   │   └── routes/          # API route handlers
│   └── web/                 # React SPA (Vite)
│       ├── index.html
│       ├── main.tsx
│       ├── pages/
│       ├── components/
│       └── hooks/
├── dist/                    # Compiled output
│   ├── core/
│   ├── cli/
│   ├── server/
│   └── web/                 # Static files from Vite build
└── docs/
```

## Build & Distribution

- TypeScript compiled with `tsc` for core/cli/server
- Vite builds React SPA to `dist/web/`
- Development: `vite dev` for frontend with proxy to Express backend; `tsx watch` for backend
- Single npm package: `npm install -g skills-ui`
- Binary entry: `skills-ui` command
- Web static files bundled inside the npm package

## Scope Boundaries

**In scope for v1:**
- Add/remove skills (delegating to `skills` CLI)
- Enable/disable per project per agent
- Project registration and management
- Web UI with all pages described above
- CLI with all commands described above
- Support for agents: claude-code, codex, antigravity, gemini

**Out of scope for v1:**
- Skill authoring/editing in the UI
- Automatic update checking/notifications
- Skill marketplace / community features
- Remote skill search/discovery (users provide URLs or paths directly)
- Desktop app wrapping (Tauri/Electron)
- Skill dependency management
- Skill versioning beyond what `skills` CLI provides

## Key Design Decisions

1. **Wrap CLI, don't import internals** — `vercel-labs/skills` has no public API. Calling the CLI via child_process is stable; importing internal modules would break on updates.

2. **Default-enabled convention** — Only track disabled state. Simpler data model, compatible with manual `skills add` usage outside of skills-ui.

3. **Single npm package** — Core, CLI, server, and web in one package. No monorepo complexity. Web assets built and bundled at publish time.

4. **State outside project directories** — `~/.skills-ui/` holds all skills-ui config. Project directories only have standard `.agents/skills/` and agent-specific symlinks — no skills-ui-specific files in projects.

5. **Express over standalone frameworks** — Lightweight, embedded in CLI process, no separate server to manage.

6. **Project path as identifier** — Absolute filesystem path is the natural unique key for projects. URL-encoded in API routes. No synthetic IDs needed.

7. **Atomic file writes** — State and config files use write-to-temp-then-rename to prevent corruption. A serialized write queue ensures concurrent API requests don't race.

8. **CLI command naming** — skills-ui uses `add`/`remove` to match the underlying `skills` CLI, avoiding confusion about which command maps to which.
