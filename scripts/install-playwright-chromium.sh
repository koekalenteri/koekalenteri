#!/usr/bin/env bash
# Installs Playwright's chromium and the system packages it needs on a GitHub Ubuntu runner, for the
# CI jobs that run browser tests (ci.yml visual-test and e2e-test, release.yml e2e).
#
# `playwright install --with-deps` refreshes the package lists and fetches the packages from the
# Ubuntu mirror on every run. The runner image already holds every library chromium links against;
# what it lacks are nine font packages (21 MB), which the screenshots need because the linux
# baselines are taken in Playwright's own image, which has them. The mirror sometimes serves them at
# 300 kB/s, a minute's wait, and the refresh alone has taken 19 s. So this installs the packages
# Playwright reports missing from the lists the image ships with, reusing the .deb files kept in
# DEB_CACHE (the workflow caches it beside the browsers), and falls back to Playwright's own install
# when that fails, a package the image's lists no longer find on the mirror for instance.
set -euo pipefail

DEB_CACHE="$HOME/.cache/ms-playwright-debs"

# Downloads the browser only when the cache does not hold the build this Playwright version expects.
npx playwright install chromium

# The dry run simulates the install against the current package lists. It exits 1 when something is
# missing, listing each package on its own line indented by two spaces.
report=$(npx playwright install-deps --dry-run chromium 2>&1) || true
echo "$report"
if grep -q '^All system dependencies are installed' <<<"$report"; then
  exit 0
fi

missing=()
if grep -q '^Missing system dependencies' <<<"$report"; then
  mapfile -t missing < <(sed -n 's/^  \([^ ]\{1,\}\)$/\1/p' <<<"$report")
fi

if [[ ${#missing[@]} -gt 0 ]]; then
  mkdir -p "$DEB_CACHE/partial"
  # needrestart only scans for services to restart, which a fresh runner has none of.
  if sudo env DEBIAN_FRONTEND=noninteractive NEEDRESTART_SUSPEND=1 \
    apt-get install -y --no-install-recommends -o Dir::Cache::Archives="$DEB_CACHE" "${missing[@]}"; then
    installed=true
  else
    installed=false
  fi
  # apt leaves a root-only lock file and download directory there, which would fail the cache save.
  sudo rm -rf "$DEB_CACHE/partial" "$DEB_CACHE/lock"
  sudo chown -R "$(id -u):$(id -g)" "$DEB_CACHE"
  if [[ $installed == true ]]; then
    exit 0
  fi
  echo "::warning::Installing ${missing[*]} from the runner's package lists failed; refreshing them"
fi

npx playwright install-deps chromium
