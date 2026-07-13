#!/bin/sh
# Run the skills-ui E2E suite fully inside Docker. Host needs Docker only.
#
#   sh e2e/scripts/run-e2e.sh             # offline tier (default)
#   sh e2e/scripts/run-e2e.sh --network   # include @network specs (container-outbound fetches)
#
# Isolation contract: zero -v/--mount flags; artifacts leave the container only via
# `docker cp` into e2e/output/ AFTER the container has exited; exit code is preserved.
set -u

IMAGE=skills-ui-e2e:test
NAME=skills-ui-e2e-run
OUT=e2e/output

NETWORK_ENV=""
if [ "${1:-}" = "--network" ]; then
  NETWORK_ENV="-e E2E_NETWORK=1"
fi

docker build -f Dockerfile.e2e -t "$IMAGE" . || exit $?

docker rm -f "$NAME" >/dev/null 2>&1

# shellcheck disable=SC2086  # NETWORK_ENV intentionally word-splits into -e KEY=VAL
docker run --name "$NAME" $NETWORK_ENV "$IMAGE" \
  npx playwright test --config e2e/playwright.config.ts
TEST_EXIT=$?

# Extract artifacts regardless of pass/fail — a failed run must still yield its report.
mkdir -p "$OUT"
rm -rf "$OUT/playwright-report" "$OUT/test-results"
docker cp "$NAME":/app/e2e/playwright-report "$OUT/playwright-report" 2>/dev/null
docker cp "$NAME":/app/e2e/test-results "$OUT/test-results" 2>/dev/null

docker rm "$NAME" >/dev/null

echo ""
echo "Report: $OUT/playwright-report  (open index.html, or: sh e2e/scripts/show-report.sh)"
exit $TEST_EXIT
