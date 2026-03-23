# skills-ui

Visual management layer for [vercel-labs/skills](https://github.com/vercel-labs/skills).

Adds a Web UI, managed project inventory, archive-backed reinstall sources, global/project status tracking, and maintenance actions on top of the `skills` CLI.

For architecture, current status, and remaining design notes, see [DEVELOPMENT.md](./DEVELOPMENT.md).

## Requirements

- Node.js 18+

## Install

Clone the repository and link it globally:

```bash
git clone https://github.com/your-username/skills-ui.git
cd skills-ui
npm install
npm run build
npm link
```

This makes the `skills-ui` command available system-wide. To uninstall:

```bash
npm unlink -g skills-ui
```

## Usage

### Web UI

```bash
skills-ui serve
# Opens at http://localhost:3456
```

### CLI

```bash
# Install a managed global skill
skills-ui add owner/repo

# Remove a managed global skill by ID or unique name
skills-ui remove skill-id-or-name

# List managed skills
skills-ui list

# Inspect maintenance state for one skill or all skills
skills-ui check
skills-ui check skill-id-or-name

# Update a managed global skill from its recorded source
skills-ui update skill-id-or-name

# Register a project
skills-ui project add /path/to/project

# Enable/disable a skill for a project+agent (accepts skill ID or unique name)
skills-ui enable skill-id-or-name --project /path/to/project --agent claude-code
skills-ui disable skill-id-or-name --project /path/to/project --agent claude-code

# Replace a managed global skill with project-local installs
skills-ui split-global skill-id-or-name

# List registered projects
skills-ui projects
```

## Supported agents

claude-code, codex, antigravity, gemini-cli
