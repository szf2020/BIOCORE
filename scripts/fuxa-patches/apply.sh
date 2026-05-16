#!/usr/bin/env bash
# Apply BIOCore patches to the vendored FUXA fork in packages/fuxa/.
# Idempotent: re-running on already-patched code is safe (patch detects + skips).
#
# Run after cloning FUXA into packages/fuxa/ (or after `pnpm install` if FUXA is
# re-installed). FUXA itself is gitignored — these patches are the only BIOCore
# overlay tracked in git.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PATCH_DIR="$REPO_ROOT/scripts/fuxa-patches"

if [ ! -d "$REPO_ROOT/packages/fuxa" ]; then
  echo "error: packages/fuxa/ not found. Clone FUXA first."
  exit 1
fi

cd "$REPO_ROOT"

for patch in "$PATCH_DIR"/*.patch; do
  [ -f "$patch" ] || continue
  name=$(basename "$patch")
  # --check first to detect if already applied
  if patch -p1 --dry-run --silent --reverse < "$patch" >/dev/null 2>&1; then
    echo "skip  $name (already applied)"
  elif patch -p1 --dry-run --silent < "$patch" >/dev/null 2>&1; then
    patch -p1 < "$patch"
    echo "apply $name"
  else
    echo "fail  $name (neither applies cleanly nor is already applied)"
    exit 1
  fi
done

echo "done. set FUXA_READONLY=true in .env (default) to enforce."
