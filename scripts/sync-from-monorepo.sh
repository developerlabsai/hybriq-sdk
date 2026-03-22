#!/usr/bin/env bash
set -euo pipefail

# ─── Sync SDK source from Hivemind v2 monorepo ───
# Source of truth: Hivemind v2/packages/sdk/
# Target: this repo (hybriq-sdk/)
#
# This script copies source code, tests, examples, and config files
# from the monorepo. It does NOT touch repo-only files (.github/, docs/,
# CONTRIBUTING.md, CHANGELOG.md, SECURITY.md, CODE_OF_CONDUCT.md, scripts/).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Configure monorepo path ──
MONOREPO_SDK="${MONOREPO_SDK:-$HOME/Projects/Hivemind v2/packages/sdk}"

if [ ! -d "$MONOREPO_SDK" ]; then
  echo "ERROR: Monorepo SDK not found at: $MONOREPO_SDK"
  echo "Set MONOREPO_SDK env var to override the path."
  exit 1
fi

echo "Syncing from: $MONOREPO_SDK"
echo "Syncing to:   $REPO_ROOT"
echo ""

# ── Sync source directories ──
echo "[1/5] Syncing src/ ..."
rm -rf "$REPO_ROOT/src"
cp -r "$MONOREPO_SDK/src" "$REPO_ROOT/src"

echo "[2/5] Syncing tests/ ..."
rm -rf "$REPO_ROOT/tests"
cp -r "$MONOREPO_SDK/tests" "$REPO_ROOT/tests"

echo "[3/5] Syncing examples/ ..."
rm -rf "$REPO_ROOT/examples"
cp -r "$MONOREPO_SDK/examples" "$REPO_ROOT/examples"

# ── Sync config files ──
echo "[4/5] Syncing config files ..."
cp "$MONOREPO_SDK/package.json" "$REPO_ROOT/package.json"
cp "$MONOREPO_SDK/tsconfig.json" "$REPO_ROOT/tsconfig.json"
cp "$MONOREPO_SDK/LICENSE" "$REPO_ROOT/LICENSE"

# Copy vitest configs if they exist
for config in vitest.config.ts vitest.integration.config.ts vitest.smoke.config.ts; do
  if [ -f "$MONOREPO_SDK/$config" ]; then
    cp "$MONOREPO_SDK/$config" "$REPO_ROOT/$config"
  fi
done

# ── Verify build ──
echo "[5/5] Verifying build ..."
cd "$REPO_ROOT"
npm install --silent 2>/dev/null
npm run build

echo ""
echo "Sync complete. Files synced from monorepo:"
echo "  src/, tests/, examples/"
echo "  package.json, tsconfig.json, LICENSE, vitest configs"
echo ""
echo "Files NOT synced (repo-only):"
echo "  .github/, docs/, scripts/"
echo "  CONTRIBUTING.md, CHANGELOG.md, SECURITY.md, CODE_OF_CONDUCT.md"
echo "  .gitignore, .editorconfig, .npmrc, README.md"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff"
echo "  2. Run tests: npm run test:all"
echo "  3. Commit and push"
