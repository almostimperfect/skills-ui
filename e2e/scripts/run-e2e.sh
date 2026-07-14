#!/bin/sh
set -eu

IMAGE=skills-ui-development-e2e:test

docker build --network=host -f Dockerfile.e2e -t "$IMAGE" .
docker run --rm "$IMAGE" npx playwright test --config e2e/playwright.config.ts
