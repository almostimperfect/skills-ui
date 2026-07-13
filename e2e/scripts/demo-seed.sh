#!/bin/sh
# Seed the CONTAINER's store with fixture skills + a sample project so the exposed
# Web UI has content to explore. Runs inside the container only (called by
# serve-docker.sh --demo); never run this on the host.
set -eu

STORE="$HOME/.agents/skills"
mkdir -p "$STORE"
cp -R /app/e2e/fixtures/skills/basic-skill "$STORE/"
cp -R /app/e2e/fixtures/skills/rich-skill "$STORE/"
cp -R "/app/e2e/fixtures/skills/spaced skill" "$STORE/"

PROJ="$HOME/projects/demo-project"
mkdir -p "$PROJ/.claude" "$PROJ/.codex"
node /app/dist/cli/index.js project add "$PROJ"

echo "demo store seeded: 3 skills, 1 project ($PROJ)"
