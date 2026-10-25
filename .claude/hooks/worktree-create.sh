#!/usr/bin/env bash
# WorktreeCreate: the worktree Claude Code would make (.claude/worktrees/<name> on branch
# worktree-<name>, from origin/main), with node_modules installed before the agent starts.
# A new worktree has none, and neither a symlink (vite resolves it and refuses the real path)
# nor an APFS clone (61 s against 28 s) does better than npm ci from the warm cache.
# Claude Code reads the last stdout line as the path; everything else goes to stderr.
set -euo pipefail

name=$(jq -r '.name')
[ -n "$name" ] && [ "$name" != null ] || { echo "WorktreeCreate: no name in the input" >&2; exit 1; }

# The main checkout, also when the session itself runs in a worktree.
common=$(git -C "${CLAUDE_PROJECT_DIR:-$PWD}" rev-parse --path-format=absolute --git-common-dir)
root=${common%/.git}
dir=$root/.claude/worktrees/$name

if [ ! -e "$dir" ]; then
  git -C "$root" fetch --quiet origin main >&2 || echo "WorktreeCreate: fetch failed, using the local origin/main" >&2
  if git -C "$root" show-ref --verify --quiet "refs/heads/worktree-$name"; then
    git -C "$root" worktree add "$dir" "worktree-$name" >&2
  else
    git -C "$root" worktree add -b "worktree-$name" "$dir" origin/main >&2
  fi
fi

if [ ! -d "$dir/node_modules" ]; then
  (cd "$dir" && npm ci --prefer-offline --no-audit --no-fund >&2) ||
    echo "WorktreeCreate: npm ci failed in $dir; run it there before the tests" >&2
fi

echo "$dir"
