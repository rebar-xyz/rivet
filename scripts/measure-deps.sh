#!/usr/bin/env bash
#
# Measures install size and dependency count for Rivet and competing Cosmos SDK clients.
# Creates isolated npm projects in $TMPDIR, cleaned up on exit.
#
# Usage: ./scripts/measure-deps.sh
#
# Prerequisites: npm installed

set -euo pipefail

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

measure_package() {
  local name="$1"
  local dir="$WORK_DIR/$name"

  mkdir -p "$dir"
  cd "$dir"
  npm init -y --silent > /dev/null 2>&1

  echo "=== $name ==="
  echo ""

  # Time the install
  local start=$(date +%s)
  npm install "$name" --silent 2>/dev/null
  local end=$(date +%s)
  local elapsed=$((end - start))

  # Total packages in dependency tree
  local total_deps=$(npm ls --all 2>/dev/null | wc -l | tr -d ' ')

  # Direct dependencies
  local direct_deps=$(npm ls --depth=0 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')

  # Disk usage
  local disk_usage=$(du -sh node_modules 2>/dev/null | cut -f1)

  # node_modules package count (actual installed packages)
  # maxdepth 3 to catch scoped packages (node_modules/@scope/pkg/package.json)
  local pkg_count=$(find node_modules -maxdepth 3 -name 'package.json' 2>/dev/null | wc -l | tr -d ' ')

  echo "  Install time:     ${elapsed}s"
  echo "  Direct deps:      $direct_deps"
  echo "  Total dep tree:   $total_deps lines"
  echo "  Installed pkgs:   $pkg_count"
  echo "  node_modules size: $disk_usage"
  echo ""

  cd "$WORK_DIR"
}

echo "============================================"
echo "  Dependency Comparison: Rivet vs Others"
echo "============================================"
echo ""

measure_package "@rebarxyz/rivet"
measure_package "@cosmjs/stargate"
measure_package "@interchainjs/cosmos"

echo "============================================"
echo "  Done."
echo "============================================"
