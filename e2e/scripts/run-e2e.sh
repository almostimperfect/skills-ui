#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
cd "$REPO_ROOT"

MODE=${1:-}

case "$MODE" in
  ""|--network) ;;
  *)
    echo "Usage: $0 [--network]" >&2
    exit 2
    ;;
esac

RUN_ID="$(date +%Y%m%d%H%M%S)-$$"
RUN_LABEL="skills-ui.test-run"
IMAGE_TAG="skills-ui-development-e2e:run-$RUN_ID"
IMAGE_ID=
TEST_CONTAINER="skills-ui-e2e-test-$RUN_ID"
PROXY_CONTAINER="skills-ui-e2e-proxy-$RUN_ID"
INTERNAL_NETWORK="skills-ui-e2e-internal-$RUN_ID"
EGRESS_NETWORK="skills-ui-e2e-egress-$RUN_ID"
PROXY_HOST="skills-ui-egress-proxy"
TEST_HOME="/tmp/skills-ui-e2e-$RUN_ID/home"
PROXY_HOME="/tmp/skills-ui-e2e-proxy-$RUN_ID/home"
CANARY_VALUE="skills-ui-host-canary-$RUN_ID"
CONTEXT_CANARY_PATH="$REPO_ROOT/.skills-ui-context-canary-$RUN_ID"
SAFE_PATH="/usr/local/bin:/usr/bin:/bin"

assert_safe_npmrc() {
  if [ ! -f .npmrc ] || [ -L .npmrc ]; then
    echo "Refusing to build without the project .npmrc." >&2
    exit 1
  fi
  if LC_ALL=C grep -Eiq '(^|[[:space:]])((//[^=[:space:]]+/)?_auth(token)?|auth|token|password|username)[[:space:]]*=|[$]([A-Za-z_]|[{(])' .npmrc; then
    echo "Refusing to build: .npmrc contains a credential field or environment interpolation." >&2
    exit 1
  fi
}

assert_tracked_tree_inputs() {
  if [ -n "$(git ls-files --others -- src e2e/specs)" ]; then
    echo "Refusing to build: an untracked file exists inside an allowlisted source or E2E tree." >&2
    exit 1
  fi
  if [ -n "$(find src e2e/specs -type l -print -quit)" ]; then
    echo "Refusing to build: symlinks are not allowed inside source or E2E build inputs." >&2
    exit 1
  fi
  if [ -n "$(find src e2e/specs ! -type f ! -type d -print -quit)" ]; then
    echo "Refusing to build: special files are not allowed inside source or E2E build inputs." >&2
    exit 1
  fi
}

create_context_canary() {
  if [ -e "$CONTEXT_CANARY_PATH" ] || [ -L "$CONTEXT_CANARY_PATH" ]; then
    echo "Refusing to replace an existing context-canary path." >&2
    exit 1
  fi
  (umask 077; set -C; printf '%s\n' "$CANARY_VALUE" > "$CONTEXT_CANARY_PATH") 2>/dev/null || {
    echo "Could not create an exclusive context-canary file." >&2
    exit 1
  }
}

remove_owned_context_canary() {
  if [ -f "$CONTEXT_CANARY_PATH" ] && [ ! -L "$CONTEXT_CANARY_PATH" ]; then
    if [ "$(cat "$CONTEXT_CANARY_PATH")" = "$CANARY_VALUE" ]; then
      rm -f "$CONTEXT_CANARY_PATH"
    else
      echo "Refusing to remove a modified context-canary file." >&2
    fi
  elif [ -e "$CONTEXT_CANARY_PATH" ] || [ -L "$CONTEXT_CANARY_PATH" ]; then
    echo "Refusing to remove an unexpected context-canary path." >&2
  fi
}

remove_owned_container() {
  container_name=$1
  owner=$(docker container inspect --format '{{ index .Config.Labels "skills-ui.test-run" }}' "$container_name" 2>/dev/null || true)
  if [ "$owner" = "$RUN_ID" ]; then
    docker container rm --force "$container_name" >/dev/null 2>&1 || true
  elif docker container inspect "$container_name" >/dev/null 2>&1; then
    echo "Refusing to remove unowned container $container_name." >&2
  fi
}

remove_owned_network() {
  network_name=$1
  owner=$(docker network inspect --format '{{ index .Labels "skills-ui.test-run" }}' "$network_name" 2>/dev/null || true)
  if [ "$owner" = "$RUN_ID" ]; then
    docker network rm "$network_name" >/dev/null 2>&1 || true
  elif docker network inspect "$network_name" >/dev/null 2>&1; then
    echo "Refusing to remove unowned network $network_name." >&2
  fi
}

remove_owned_image() {
  owner=$(docker image inspect --format '{{ index .Config.Labels "skills-ui.test-run" }}' "$IMAGE_TAG" 2>/dev/null || true)
  if [ "$owner" = "$RUN_ID" ]; then
    docker image rm "$IMAGE_TAG" >/dev/null 2>&1 || true
  elif docker image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
    echo "Refusing to remove unowned image $IMAGE_TAG." >&2
  fi
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM

  if [ "$status" -ne 0 ]; then
    proxy_owner=$(docker container inspect --format '{{ index .Config.Labels "skills-ui.test-run" }}' "$PROXY_CONTAINER" 2>/dev/null || true)
    if [ "$proxy_owner" = "$RUN_ID" ]; then
      echo "Restricted proxy diagnostics:" >&2
      docker container logs "$PROXY_CONTAINER" >&2 || true
    fi
  fi

  remove_owned_container "$TEST_CONTAINER"
  remove_owned_container "$PROXY_CONTAINER"
  remove_owned_network "$INTERNAL_NETWORK"
  remove_owned_network "$EGRESS_NETWORK"
  remove_owned_image
  remove_owned_context_canary

  exit "$status"
}

trap cleanup EXIT HUP INT TERM

assert_safe_npmrc
assert_tracked_tree_inputs
create_context_canary

assert_non_root_image() {
  image_user=$(docker image inspect --format '{{.Config.User}}' "$IMAGE_ID")
  case "$image_user" in
    ""|root|root:*|0|0:*|*:0)
      echo "Refusing to run E2E tests: image user must be an explicit non-root user (found '$image_user')." >&2
      exit 1
      ;;
  esac
}

wait_for_proxy() {
  attempts=0
  while [ "$attempts" -lt 20 ]; do
    proxy_logs=$(docker container logs "$PROXY_CONTAINER" 2>&1 || true)
    case "$proxy_logs" in
      *proxy-ready*) return 0 ;;
    esac

    proxy_running=$(docker container inspect --format '{{.State.Running}}' "$PROXY_CONTAINER" 2>/dev/null || true)
    if [ "$proxy_running" != "true" ]; then
      echo "The restricted network proxy stopped before it became ready." >&2
      echo "$proxy_logs" >&2
      return 1
    fi

    attempts=$((attempts + 1))
    sleep 1
  done

  echo "Timed out waiting for the restricted network proxy." >&2
  return 1
}

# A unique tag prevents concurrent runs from replacing one another. Every run
# below uses the immutable image ID resolved from that tag, never the tag itself.
docker build \
  --build-arg "SKILLS_UI_CONTEXT_CANARY=$CANARY_VALUE" \
  --build-arg HTTP_PROXY= \
  --build-arg HTTPS_PROXY= \
  --build-arg FTP_PROXY= \
  --build-arg ALL_PROXY= \
  --build-arg NO_PROXY= \
  --build-arg http_proxy= \
  --build-arg https_proxy= \
  --build-arg ftp_proxy= \
  --build-arg all_proxy= \
  --build-arg no_proxy= \
  --label "$RUN_LABEL=$RUN_ID" \
  --file Dockerfile.e2e \
  --tag "$IMAGE_TAG" \
  .
IMAGE_ID=$(docker image inspect --format '{{.Id}}' "$IMAGE_TAG")
case "$IMAGE_ID" in
  sha256:*) ;;
  *)
    echo "Could not resolve an immutable image ID for $IMAGE_TAG." >&2
    exit 1
    ;;
esac

image_owner=$(docker image inspect --format '{{ index .Config.Labels "skills-ui.test-run" }}' "$IMAGE_ID")
if [ "$image_owner" != "$RUN_ID" ]; then
  echo "Refusing to run E2E tests: image ownership label does not match this run." >&2
  exit 1
fi
assert_non_root_image

if [ "$MODE" != "--network" ]; then
  # No mounts, host credentials, Docker socket, or inherited environment are
  # passed to this container. All writable state is disposable tmpfs state.
  docker run --rm \
    --name "$TEST_CONTAINER" \
    --label "$RUN_LABEL=$RUN_ID" \
    --label skills-ui.test-role=deterministic-e2e \
    --network none \
    --read-only \
    --tmpfs /tmp:rw,nosuid,nodev,noexec,size=1g \
    --tmpfs /dev/shm:rw,nosuid,nodev,noexec,size=1g \
    --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --pids-limit 512 \
    --memory 2g \
    --cpus 2 \
    --init \
    --env CI=1 \
    --env DISABLE_TELEMETRY=1 \
    --env DO_NOT_TRACK=1 \
    --env HOME="$TEST_HOME" \
    --env TMPDIR="$TEST_HOME/tmp" \
    --env XDG_CACHE_HOME="$TEST_HOME/.cache" \
    --env XDG_CONFIG_HOME="$TEST_HOME/.config" \
    --env XDG_DATA_HOME="$TEST_HOME/.local/share" \
    --env XDG_RUNTIME_DIR="$TEST_HOME/.runtime" \
    --env XDG_STATE_HOME="$TEST_HOME/.local/state" \
    --env PATH="$SAFE_PATH" \
    --env HTTP_PROXY= \
    --env HTTPS_PROXY= \
    --env FTP_PROXY= \
    --env ALL_PROXY= \
    --env NO_PROXY= \
    --env http_proxy= \
    --env https_proxy= \
    --env ftp_proxy= \
    --env all_proxy= \
    --env no_proxy= \
    "$IMAGE_ID" \
    sh -eu -c '
      umask 077
      mkdir -p \
        "$HOME" \
        "$TMPDIR" \
        "$XDG_CACHE_HOME" \
        "$XDG_CONFIG_HOME" \
        "$XDG_DATA_HOME" \
        "$XDG_RUNTIME_DIR" \
        "$XDG_STATE_HOME"
      test "$(id -u)" -ne 0
      test ! -e /app/.git
      test ! -e /app/.development
      test ! -e /app/tmp
      test -w /tmp
      test ! -w /app
      test -z "${GITHUB_TOKEN:-}${GH_TOKEN:-}${NPM_TOKEN:-}${NODE_AUTH_TOKEN:-}${SSH_AUTH_SOCK:-}${DOCKER_HOST:-}"
      ! grep -R -F "$1" /app >/dev/null 2>&1
      exec /app/node_modules/.bin/playwright test --config e2e/playwright.config.ts
    ' sh "$CANARY_VALUE"
  exit 0
fi

# The test container joins only the internal network. That network still gives
# it Docker DNS and a route to the named proxy; it is not equivalent to
# --network none. Docker's internal flag prevents direct external routing, and
# the proxy is the only component also attached to the separate egress network.
docker network create \
  --internal \
  --label "$RUN_LABEL=$RUN_ID" \
  --label skills-ui.test-role=internal-network \
  "$INTERNAL_NETWORK" >/dev/null

# A per-run egress network avoids sharing Docker's default bridge with unrelated
# containers. It deliberately has external routing for the allowlisting proxy.
docker network create \
  --label "$RUN_LABEL=$RUN_ID" \
  --label skills-ui.test-role=proxy-egress-network \
  "$EGRESS_NETWORK" >/dev/null

# network-proxy.mjs imports only Node built-ins and hard-codes the exact GitHub
# host allowlist used by the recorded real-source cases.
docker run --detach \
  --name "$PROXY_CONTAINER" \
  --label "$RUN_LABEL=$RUN_ID" \
  --label skills-ui.test-role=network-proxy \
  --network "$INTERNAL_NETWORK" \
  --network-alias "$PROXY_HOST" \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 64 \
  --memory 128m \
  --cpus 0.5 \
  --init \
  --env CI=1 \
  --env DISABLE_TELEMETRY=1 \
  --env DO_NOT_TRACK=1 \
  --env HOME="$PROXY_HOME" \
  --env TMPDIR="$PROXY_HOME/tmp" \
  --env XDG_CACHE_HOME="$PROXY_HOME/.cache" \
  --env XDG_CONFIG_HOME="$PROXY_HOME/.config" \
  --env XDG_DATA_HOME="$PROXY_HOME/.local/share" \
  --env XDG_RUNTIME_DIR="$PROXY_HOME/.runtime" \
  --env XDG_STATE_HOME="$PROXY_HOME/.local/state" \
  --env PATH="$SAFE_PATH" \
  --env HTTP_PROXY= \
  --env HTTPS_PROXY= \
  --env FTP_PROXY= \
  --env ALL_PROXY= \
  --env NO_PROXY= \
  --env http_proxy= \
  --env https_proxy= \
  --env ftp_proxy= \
  --env all_proxy= \
  --env no_proxy= \
  "$IMAGE_ID" \
  sh -eu -c '
    umask 077
    mkdir -p \
      "$HOME" \
      "$TMPDIR" \
      "$XDG_CACHE_HOME" \
      "$XDG_CONFIG_HOME" \
      "$XDG_DATA_HOME" \
      "$XDG_RUNTIME_DIR" \
      "$XDG_STATE_HOME"
    exec node /app/e2e/scripts/network-proxy.mjs
  ' >/dev/null

# Attach the routed network last so Docker selects its gateway for the proxy's
# outbound traffic. The test container remains connected only to the internal
# network and can reach the proxy solely through its internal alias.
docker network connect --gw-priority 1 "$EGRESS_NETWORK" "$PROXY_CONTAINER"
wait_for_proxy

PROXY_INTERNAL_IP=$(docker container inspect \
  --format "{{(index .NetworkSettings.Networks \"$INTERNAL_NETWORK\").IPAddress}}" \
  "$PROXY_CONTAINER")
case "$PROXY_INTERNAL_IP" in
  ""|*[!0-9.]*)
    echo "Could not resolve the restricted proxy's internal IPv4 address." >&2
    exit 1
    ;;
esac
PROXY_URL="http://$PROXY_INTERNAL_IP:8080"

# Only fixed, non-secret proxy and isolation variables enter the network test.
# Git receives an explicit proxy configuration so it cannot bypass the internal
# network through user or system configuration files.
docker run --rm \
  --name "$TEST_CONTAINER" \
  --label "$RUN_LABEL=$RUN_ID" \
  --label skills-ui.test-role=network-e2e \
  --network "$INTERNAL_NETWORK" \
  --dns 192.0.2.1 \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=1g \
  --tmpfs /dev/shm:rw,nosuid,nodev,noexec,size=1g \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 512 \
  --memory 2g \
  --cpus 2 \
  --init \
  --env CI=1 \
  --env E2E_NETWORK=1 \
  --env DISABLE_TELEMETRY=1 \
  --env DO_NOT_TRACK=1 \
  --env NODE_USE_ENV_PROXY=1 \
  --env HOME="$TEST_HOME" \
  --env TMPDIR="$TEST_HOME/tmp" \
  --env XDG_CONFIG_HOME="$TEST_HOME/.config" \
  --env XDG_CACHE_HOME="$TEST_HOME/.cache" \
  --env XDG_DATA_HOME="$TEST_HOME/.local/share" \
  --env XDG_RUNTIME_DIR="$TEST_HOME/.runtime" \
  --env XDG_STATE_HOME="$TEST_HOME/.local/state" \
  --env PATH="$SAFE_PATH" \
  --env HTTP_PROXY="$PROXY_URL" \
  --env HTTPS_PROXY="$PROXY_URL" \
  --env ALL_PROXY="$PROXY_URL" \
  --env http_proxy="$PROXY_URL" \
  --env https_proxy="$PROXY_URL" \
  --env all_proxy="$PROXY_URL" \
  --env NO_PROXY=127.0.0.1,localhost \
  --env no_proxy=127.0.0.1,localhost \
  --env GIT_TERMINAL_PROMPT=0 \
  --env GIT_ALLOW_PROTOCOL=https \
  --env GIT_CONFIG_NOSYSTEM=1 \
  --env GIT_CONFIG_GLOBAL=/dev/null \
  --env GIT_CONFIG_COUNT=5 \
  --env GIT_CONFIG_KEY_0=http.proxy \
  --env GIT_CONFIG_VALUE_0="$PROXY_URL" \
  --env GIT_CONFIG_KEY_1=core.hooksPath \
  --env GIT_CONFIG_VALUE_1=/dev/null \
  --env GIT_CONFIG_KEY_2=protocol.allow \
  --env GIT_CONFIG_VALUE_2=never \
  --env GIT_CONFIG_KEY_3=protocol.https.allow \
  --env GIT_CONFIG_VALUE_3=always \
  --env GIT_CONFIG_KEY_4=credential.helper \
  --env GIT_CONFIG_VALUE_4= \
  --env FTP_PROXY= \
  --env ftp_proxy= \
  "$IMAGE_ID" \
  sh -eu -c '
    umask 077
    mkdir -p \
      "$HOME" \
      "$TMPDIR" \
      "$XDG_CACHE_HOME" \
      "$XDG_CONFIG_HOME" \
      "$XDG_DATA_HOME" \
      "$XDG_RUNTIME_DIR" \
      "$XDG_STATE_HOME"
    test "$(id -u)" -ne 0
    test ! -e /app/.git
    test ! -e /app/.development
    test ! -e /app/tmp
    test -w /tmp
    test ! -w /app
    test -z "${GITHUB_TOKEN:-}${GH_TOKEN:-}${NPM_TOKEN:-}${NODE_AUTH_TOKEN:-}${SSH_AUTH_SOCK:-}${DOCKER_HOST:-}"
    ! grep -R -F "$1" /app >/dev/null 2>&1
    exec /app/node_modules/.bin/playwright test --config e2e/playwright.config.ts
  ' sh "$CANARY_VALUE"
