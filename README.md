# skills-ui

Visual management layer for [vercel-labs/skills](https://github.com/vercel-labs/skills).

Adds a Web UI, managed project inventory, archive-backed reinstall sources, global/project status tracking, and maintenance actions on top of the `skills` CLI.

For architecture, current status, and remaining design notes, see [DEVELOPMENT.md](./DEVELOPMENT.md).
For product direction, see [docs/PRODUCT_DESIGN.md](./docs/PRODUCT_DESIGN.md).

## Requirements

- Node.js 20+ for direct host installation and use. Node.js 20 is end-of-life;
  use a currently supported LTS release for a new environment.
- npm 10.8.2 for reproducible direct host dependency operations.
- Docker for the preferred contributor test flow. The Docker shell runners do
  not require Node.js or npm to be installed globally on the host.

## Install

Clone the repository and link it globally:

```bash
git clone https://github.com/your-username/skills-ui.git
cd skills-ui
npm ci
npm run build
npm link
```

`npm ci` performs a lockfile-exact install. The tracked `.npmrc` disables
dependency lifecycle scripts during acquisition, but installing and later
running dependencies directly on the host is still a host trust decision.

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

## Contributor validation

Use the Docker-first deterministic tiers for routine validation:

```bash
sh scripts/run-docker-tests.sh
sh e2e/scripts/run-e2e.sh
```

Both run with runtime networking disabled and without host bind mounts. The
separate real-source tier downloads only the recorded test Skills and must be
run with explicit owner authorization:

```bash
sh e2e/scripts/run-e2e.sh --network
```

The image build can still pull pinned base images and run a lockfile-controlled
`npm ci` against the npm registry before application source is copied. See
[Real Network Source Smoke Test v1.2](./docs/testing/network-source-smoke-test-v1.2.md)
for the complete boundary and its residual risks.
