#!/usr/bin/env bash
# PreToolUse (Bash): a branch is brought up to date by rebasing it, never by merging into it.
# A merge commit stages every file main changed since the branch point, so the pre-commit hook
# runs the tests of all of them, minutes on a branch a day behind; a rebase replays the branch's
# own commits and runs no hook. Refused: `git merge` (but `--abort`) and `git pull` without
# `--rebase`/`-r`/`--ff-only`, also behind `git -C <dir>` or `git -c <key=value>`. `git merge-base`,
# `git merge-tree` and `gh pr merge` are other commands and pass.
set -u

command=$(jq -r '.tool_input.command // ""')

git_cmd='(^|[;&|(`\s])git(\s+(-C|-c)\s+\S+|\s+--?[A-Za-z][^\s]*)*\s+'

if jq -en --arg c "$command" --arg g "$git_cmd" \
  '$c | test($g + "merge(?![-\\w])") and (test($g + "merge(?![-\\w])[^;&|]*\\s--abort\\b") | not)' >/dev/null; then
  echo "Refused: git merge. Bring the branch up to date with \`git rebase origin/main\` and push with \`--force-with-lease\`; a merge commit makes the pre-commit hook test every file main changed. To leave a merge in progress, \`git merge --abort\`." >&2
  exit 2
fi

if jq -en --arg c "$command" --arg g "$git_cmd" \
  '$c | test($g + "pull(?![-\\w])") and (test($g + "pull(?![-\\w])[^;&|]*\\s(--rebase|-r|--ff-only)\\b") | not)' >/dev/null; then
  echo "Refused: git pull without --rebase. Use \`git pull --rebase\` or \`git fetch\` and \`git rebase origin/main\`." >&2
  exit 2
fi

exit 0
