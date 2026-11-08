#!/usr/bin/env bash
# PostToolUse after Edit or Write: lists existing functions that look like the ones just written,
# so a helper is reused instead of written again (kurkle/semindex, a private tool on the
# maintainer's machine). Without semindex on PATH the hook does nothing.
set -u

command -v semindex >/dev/null 2>&1 || exit 0
exec semindex hook
