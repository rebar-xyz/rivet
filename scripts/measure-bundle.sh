#!/usr/bin/env bash
#
# Measures gzipped bundle size for Rivet and competing Cosmos SDK clients.
# Uses bun's bundler with minification and tree-shaking (--bundle --minify --target=browser).
#
# Usage: ./scripts/measure-bundle.sh
#
# Prerequisites: bun installed

set -euo pipefail

RIVET_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR; rm -f $RIVET_DIR/bundle-measure.ts" EXIT

format_size() {
  local bytes=$1
  if [ "$bytes" -ge 1048576 ]; then
    echo "$(echo "scale=2; $bytes / 1048576" | bc) MB"
  elif [ "$bytes" -ge 1024 ]; then
    echo "$(echo "scale=1; $bytes / 1024" | bc) KB"
  else
    echo "${bytes} B"
  fi
}

measure() {
  local name=$1
  local entry=$2
  local outfile="$TMP_DIR/${name}.js"

  local output
  output=$(bun build "$entry" --bundle --minify --outfile="$outfile" --target=browser 2>&1)
  local modules
  modules=$(echo "$output" | grep -o 'Bundled [0-9]* modules' | grep -o '[0-9]*' || echo "?")

  local raw_bytes
  raw_bytes=$(wc -c < "$outfile" | tr -d ' ')
  local gz_bytes
  gz_bytes=$(gzip -c "$outfile" | wc -c | tr -d ' ')

  printf "%-20s %6s modules  %10s raw  %10s gzipped\n" "$name" "$modules" "$(format_size $raw_bytes)" "$(format_size $gz_bytes)"
}

echo "Bundle size comparison (bun build --bundle --minify --target=browser)"
echo "====================================================================="
echo ""

# --- Rivet ---
# Note: bun's bundler optimizes `export { X } from` as pass-through re-exports
# and skips bundling. Using globalThis assignment forces full resolution.
cat > "$RIVET_DIR/bundle-measure.ts" << 'EOF'
import { Rivet, defineProto, defineMessage, RivetWebSocket } from './src/index.ts';
import { bank } from './src/modules/bank.ts';
import { staking } from './src/modules/staking.ts';
import { gov } from './src/modules/gov.ts';
import { distribution } from './src/modules/distribution.ts';
globalThis.__rivet = { Rivet, defineProto, defineMessage, RivetWebSocket, bank, staking, gov, distribution };
EOF
measure "Rivet" "$RIVET_DIR/bundle-measure.ts"
rm "$RIVET_DIR/bundle-measure.ts"

# --- CosmJS ---
COSMJS_DIR="$TMP_DIR/cosmjs"
mkdir -p "$COSMJS_DIR"
cat > "$COSMJS_DIR/package.json" << 'EOF'
{
  "type": "module",
  "dependencies": {
    "@cosmjs/stargate": "^0.38.1",
    "@cosmjs/proto-signing": "^0.38.1",
    "cosmjs-types": "^0.11.0"
  }
}
EOF
echo -n "Installing CosmJS... "
(cd "$COSMJS_DIR" && bun install --silent 2>/dev/null)
echo "done"

cat > "$COSMJS_DIR/entry.ts" << 'EOF'
export { SigningStargateClient, StargateClient } from '@cosmjs/stargate';
export { DirectSecp256k1HdWallet, Registry } from '@cosmjs/proto-signing';
export { MsgSend } from 'cosmjs-types/cosmos/bank/v1beta1/tx';
export { MsgDelegate, MsgUndelegate, MsgBeginRedelegate } from 'cosmjs-types/cosmos/staking/v1beta1/tx';
export { MsgVote, MsgSubmitProposal, MsgDeposit } from 'cosmjs-types/cosmos/gov/v1beta1/tx';
export { MsgWithdrawDelegatorReward } from 'cosmjs-types/cosmos/distribution/v1beta1/tx';
EOF
measure "CosmJS" "$COSMJS_DIR/entry.ts"

# --- InterchainJS ---
ICHAINJS_DIR="$TMP_DIR/ichainjs"
mkdir -p "$ICHAINJS_DIR"
cat > "$ICHAINJS_DIR/package.json" << 'EOF'
{
  "type": "module",
  "dependencies": {
    "@interchainjs/cosmos": "^1.17.6",
    "@interchainjs/types": "^1.17.6"
  }
}
EOF
echo -n "Installing InterchainJS... "
(cd "$ICHAINJS_DIR" && bun install --silent 2>/dev/null)
echo "done"

# InterchainJS does not expose individual message type imports like CosmJS.
# Messages are constructed at runtime via typeUrl strings with untyped value objects.
# The narrowest useful import (e.g., just DirectSigner) still pulls the full dependency
# graph including libsodium WASM, so selective imports don't reduce bundle size.
cat > "$ICHAINJS_DIR/entry.ts" << 'EOF'
export * from '@interchainjs/cosmos';
EOF
measure "InterchainJS" "$ICHAINJS_DIR/entry.ts"

echo ""
echo "Notes:"
echo "  - All measurements use the same bundler settings"
echo "  - Rivet includes all 4 built-in modules (bank, staking, gov, distribution)"
echo "  - CosmJS includes equivalent message types from cosmjs-types"
echo "  - InterchainJS: selective imports are not possible — the package does not expose"
echo "    individual message types, and even importing only DirectSigner pulls the full"
echo "    dependency graph (including libsodium WASM). export * is the realistic usage."
