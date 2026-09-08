#!/usr/bin/env bash
# Regenerate (or verify) the linux reference screenshots the way CI sees them.
#
# The working tree is copied into the container rather than bind-mounted for the install:
# `npm ci` inside a mounted repo would replace the host's node_modules with linux binaries and
# break the local toolchain. Only the screenshots are copied back out.
#
# Args are forwarded to `npm run test-visual --`, so e.g.
#   npm run test-visual-linux -- BreedDistributionChart -u
# regenerates just that component's linux baseline. With no args this only verifies (matches CI).
set -euo pipefail

# Keep in step with the `playwright` devDependency: the image ships the browser build that version
# expects, and a stale tag fails with "Executable doesn't exist at /ms-playwright/...".
IMAGE="mcr.microsoft.com/playwright:v1.63.0-noble"

# Visual tests live wherever their component does, so every __screenshots__ directory under src is
# copied back.
docker run --rm \
  -v "$PWD":/src:ro \
  -v "$PWD/src":/out \
  "$IMAGE" \
  bash -c "
    set -euo pipefail
    mkdir -p /work && cd /src
    tar --exclude=node_modules --exclude=.git --exclude=dist --exclude=coverage -cf - . | (cd /work && tar -xf -)
    cd /work
    npm ci --no-audit --no-fund
    npm run test-visual -- --run $* || true
    cd /work/src
    find . -path '*/__screenshots__/*' -name '*-chromium-linux.png' -exec cp --parents {} /out/ \;
  "
