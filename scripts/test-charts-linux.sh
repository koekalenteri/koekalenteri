#!/usr/bin/env bash
# Regenerate (or verify) the linux reference screenshots the way CI sees them.
#
# The working tree is copied into the container rather than bind-mounted for the install:
# `npm ci` inside a mounted repo would replace the host's node_modules with linux binaries and
# break the local toolchain. Only the screenshots are copied back out.
#
# Args are forwarded to `npm run test-charts --`, so e.g.
#   npm run test-charts-linux -- BreedDistributionChart -u
# regenerates just that chart's linux baseline. With no args this only verifies (matches CI).
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.62.1-noble"
SHOTS="src/pages/components/stats/__screenshots__"

docker run --rm \
  -v "$PWD":/src:ro \
  -v "$PWD/$SHOTS":/out \
  "$IMAGE" \
  bash -c "
    set -euo pipefail
    mkdir -p /work && cd /src
    tar --exclude=node_modules --exclude=.git --exclude=dist --exclude=coverage -cf - . | (cd /work && tar -xf -)
    cd /work
    npm ci --no-audit --no-fund
    npm run test-charts -- --run $* || true
    cp -r /work/$SHOTS/. /out/
  "
