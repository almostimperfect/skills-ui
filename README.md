# skills-ui

Visual management layer for [vercel-labs/skills](https://github.com/vercel-labs/skills).

Adds a Web UI and per-project enable/disable toggle on top of the `skills` CLI.

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

Project paths must be existing absolute directories. Enable/disable commands also verify that the
project is registered, the agent is managed by it, and the skill is installed; failed operations exit
with an error instead of reporting success.

In the Web UI, skill/project removal asks for confirmation. Project registration, skill installation,
agent toggles, and bulk operations show pending or failure feedback, and add forms support Enter to
submit and Escape to cancel.

## Docker acceptance tests

The host only needs Docker; test containers do not mount the host HOME or skill store.

```bash
sh e2e/scripts/run-e2e.sh            # deterministic offline CLI/API/Web acceptance
sh e2e/scripts/run-e2e.sh --network  # also test real external skill sources
```

## Supported agents

claude-code, codex, antigravity, gemini
