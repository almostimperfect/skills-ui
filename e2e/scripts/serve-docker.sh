#!/bin/sh
# Expose the skills-ui Web UI on the host at http://localhost:3456 — fully containerized.
#
#   sh e2e/scripts/serve-docker.sh          # empty store
#   sh e2e/scripts/serve-docker.sh --demo   # pre-seeded fixture skills + a sample project
#
# Isolation contract: zero -v/--mount flags. The container has its own $HOME; every
# write (~/.skills-ui, ~/.agents) lives and dies with the container (--rm).
set -u

IMAGE=skills-ui-e2e:test
PORT="${PORT:-3456}"

docker build -f Dockerfile.e2e -t "$IMAGE" . || exit $?

if [ "${1:-}" = "--demo" ]; then
  exec docker run --rm -p "$PORT":3456 "$IMAGE" \
    sh -c 'sh e2e/scripts/demo-seed.sh && node dist/cli/index.js serve --port 3456'
else
  exec docker run --rm -p "$PORT":3456 "$IMAGE" \
    node dist/cli/index.js serve --port 3456
fi
