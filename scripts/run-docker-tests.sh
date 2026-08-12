#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"

RUN_ID="$(date +%Y%m%d%H%M%S)-$$"
RUN_LABEL="skills-ui.test-run"
IMAGE_TAG="skills-ui-development-test:run-$RUN_ID"
IMAGE_ID=
TEST_CONTAINER="skills-ui-unit-test-$RUN_ID"
TEST_HOME="/tmp/skills-ui-unit-$RUN_ID/home"
CANARY_VALUE="skills-ui-host-canary-$RUN_ID"
CONTEXT_CANARY_PATH="$REPO_ROOT/src/.skills-ui-context-canary-$RUN_ID"
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
  if [ -n "$(git ls-files --others -- src tests)" ]; then
    echo "Refusing to build: an untracked file exists inside an allowlisted source or test tree." >&2
    exit 1
  fi
  if [ -n "$(find src tests -type l -print -quit)" ]; then
    echo "Refusing to build: symlinks are not allowed inside source or test build inputs." >&2
    exit 1
  fi
  if [ -n "$(find src tests ! -type f ! -type d -print -quit)" ]; then
    echo "Refusing to build: special files are not allowed inside source or test build inputs." >&2
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

  remove_owned_container "$TEST_CONTAINER"
  remove_owned_image
  remove_owned_context_canary

  exit "$status"
}

trap cleanup EXIT HUP INT TERM

assert_safe_npmrc
assert_tracked_tree_inputs
create_context_canary

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
  --file Dockerfile.test \
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
  echo "Refusing to run tests: image ownership label does not match this run." >&2
  exit 1
fi

image_user=$(docker image inspect --format '{{.Config.User}}' "$IMAGE_ID")
case "$image_user" in
  ""|root|root:*|0|0:*|*:0)
    echo "Refusing to run tests: image user must be an explicit non-root user (found '$image_user')." >&2
    exit 1
    ;;
esac

# Run the immutable image ID with no mounts, network, inherited credentials, or
# writable image layer. Test-created files live only in the disposable tmpfs.
docker run --rm \
  --name "$TEST_CONTAINER" \
  --label "$RUN_LABEL=$RUN_ID" \
  --label skills-ui.test-role=unit \
  --network none \
  --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=512m \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --pids-limit 256 \
  --memory 1g \
  --cpus 2 \
  --init \
  --env CI=1 \
  --env DISABLE_TELEMETRY=1 \
  --env DO_NOT_TRACK=1 \
  --env VITEST_SKIP_INSTALL_CHECKS=1 \
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

    config_dir="$TMPDIR/vitest-config"
    mkdir -p "$config_dir/node_modules"
    ln -s /app/node_modules/vitest "$config_dir/node_modules/vitest"
    cp /app/vitest.config.ts "$config_dir/vitest.config.ts"
    exec /app/node_modules/.bin/vitest run \
      --no-cache \
      --root /app \
      --config "$config_dir/vitest.config.ts"
  ' sh "$CANARY_VALUE"
