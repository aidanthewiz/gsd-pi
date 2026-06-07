#!/usr/bin/env bash
# gsd-pi + scripts/publish-workspace-packages.sh
#
# Publishes every publishable @opengsd workspace package to npm, in dependency
# order, at the current root package.json version. The package list is derived
# from scripts/lib/npm-release-packages.cjs (driven by each package's
# publishConfig) — NOT a hardcoded list — so a new publishable package can never
# be silently forgotten the way @opengsd/cloud-mcp-gateway and @opengsd/daemon
# were.
#
# Assumes the build already ran and prepack has resolved workspace: ranges
# (callers run scripts/prepack-resolve-workspace.cjs + the postpack restore trap).
# Idempotent: a package already published at this version is skipped.
#
# Env:
#   TAG_FLAG        extra npm publish flags (e.g. "--tag latest"); optional
#   NODE_AUTH_TOKEN npm auth token for the token-auth fallback; optional (OIDC default)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
TAG_FLAG="${TAG_FLAG:-}"

mapfile -t PACKAGES < <(node scripts/lib/npm-release-packages.cjs --workspace-dirs)

if [ "${#PACKAGES[@]}" -eq 0 ]; then
  echo "No publishable workspace packages found."
  exit 0
fi

wait_for_workspace_package() {
  local package="$1"
  local delay=5
  for attempt in $(seq 1 5); do
    if [ "$(npm view "${package}@${VERSION}" version 2>/dev/null || echo "")" = "${VERSION}" ]; then
      echo "  ✓ ${package}@${VERSION} visible on npm (attempt ${attempt})"
      return 0
    fi
    if [ "${attempt}" = "5" ]; then
      echo "::error::${package}@${VERSION} not visible on npm after 5 attempts"
      exit 1
    fi
    echo "  Attempt ${attempt}: ${package}@${VERSION} not visible yet, retrying in ${delay}s..."
    sleep "${delay}"
    delay=$((delay * 2))
    if [ "${delay}" -gt 30 ]; then delay=30; fi
  done
}

echo "Publishing ${#PACKAGES[@]} workspace package(s) at ${VERSION} (dependency order):"
printf '  - %s\n' "${PACKAGES[@]}"

for workspace in "${PACKAGES[@]}"; do
  if npm view "${workspace}@${VERSION}" version >/dev/null 2>&1; then
    echo "${workspace}@${VERSION} already published, skipping"
    continue
  fi
  # shellcheck disable=SC2086
  npm publish --workspace "${workspace}" --ignore-scripts ${TAG_FLAG}
  wait_for_workspace_package "${workspace}"
done

echo "All workspace packages published at ${VERSION}."
