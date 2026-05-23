#!/usr/bin/env bash
# Xcode 26+ ships Metal as an optional component; without it, .metal shader
# compilation (Skia, vision-camera) fails with "cannot execute tool 'metal'".
# Idempotent: no-op when toolchain is already resolvable.
set -euo pipefail

[[ "$(uname)" == "Darwin" ]] || exit 0

if xcrun -f metal >/dev/null 2>&1; then
  exit 0
fi

echo "Metal Toolchain not found — downloading (~700MB)…"
xcodebuild -downloadComponent MetalToolchain
