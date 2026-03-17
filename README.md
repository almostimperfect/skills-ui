# skills-ui

Visual management layer for [vercel-labs/skills](https://github.com/vercel-labs/skills).

Adds a Web UI and per-project enable/disable toggle on top of the `skills` CLI.

## Requirements

- Node.js 18+
- `skills` CLI: `npm install -g skills`

## Install

```bash
npm install -g skills-ui
```

## Usage

### Web UI

```bash
skills-ui serve
# Opens at http://localhost:3456
```

### CLI

```bash
# Install a skill
skills-ui add owner/repo

# Remove a skill
skills-ui remove skill-name

# List installed skills
skills-ui list

# Register a project
skills-ui project add /path/to/project

# Enable/disable a skill for a project+agent
skills-ui enable skill-name --project /path/to/project --agent claude-code
skills-ui disable skill-name --project /path/to/project --agent claude-code

# List registered projects
skills-ui projects
```

## Development

```bash
npm install

# Terminal 1: backend
npm run dev:server

# Terminal 2: frontend
npm run dev:web
# Visit http://localhost:5173
```

## Supported agents

claude-code, codex, antigravity, gemini
