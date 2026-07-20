#!/bin/sh
set -eu

IMAGE=skills-ui-development-e2e:test
MODE=${1:-}

case "$MODE" in
  ""|--network) ;;
  *)
    echo "Usage: $0 [--network]" >&2
    exit 2
    ;;
esac

# The image receives only files allowed by .dockerignore. There are deliberately
# no -v/--mount flags, so tests cannot read or alter the host filesystem.
docker build -f Dockerfile.e2e -t "$IMAGE" .

if [ "$MODE" = "--network" ]; then
  # Outbound access is available only for explicitly requested source-download tests.
  docker run --rm -e E2E_NETWORK=1 "$IMAGE" \
    npx playwright test --config e2e/playwright.config.ts
else
  # Deterministic suite: even accidental outbound requests are blocked.
  docker run --rm --network=none "$IMAGE" \
    npx playwright test --config e2e/playwright.config.ts
fi
