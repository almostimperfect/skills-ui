#!/bin/sh
# Serve the extracted Playwright HTML report on http://localhost:9323 using a
# throwaway container (no host node, no mounts — report is piped in via stdin tar).
set -eu

OUT=e2e/output/playwright-report
PORT="${PORT:-9323}"

if [ ! -d "$OUT" ]; then
  echo "No report at $OUT — run: sh e2e/scripts/run-e2e.sh" >&2
  exit 1
fi

echo "Report at http://localhost:$PORT  (Ctrl-C to stop)"
tar -C "$OUT" -cf - . | docker run --rm -i -p "$PORT":80 \
  --name skills-ui-e2e-report nginx:alpine \
  sh -c 'mkdir -p /usr/share/nginx/html && tar -C /usr/share/nginx/html -xf - && nginx -g "daemon off;"'
