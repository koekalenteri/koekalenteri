#!/usr/bin/env bash
# UserPromptSubmit: "/ticket KOE-1490" names the session "KOE-1490 <summary>".
# The summary comes from Jira with the credentials in .env; without them, or when Jira does not
# answer in time, the session is named by the key alone. Any other prompt passes through untouched.
set -u

input=$(cat)
prompt=$(jq -r '.prompt // ""' <<<"$input")
key=$(sed -nE '1s/^[[:space:]]*\/ticket[[:space:]]+([A-Za-z]+-[0-9]+).*/\1/p' <<<"$prompt" | tr '[:lower:]' '[:upper:]')
[ -n "$key" ] || exit 0

title=$key
current=$(jq -r '.session_title // ""' <<<"$input")
case "$current" in "$key" | "$key "*) exit 0 ;; esac

# A worktree has no .env of its own; the main checkout's is beside the shared git directory.
dir=${CLAUDE_PROJECT_DIR:-$PWD}
env_file=$dir/.env
if [ ! -f "$env_file" ]; then
  common=$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  env_file=${common%/.git}/.env
fi
read_env() { sed -nE "s/^$1=[\"']?([^\"']*)[\"']?[[:space:]]*$/\1/p" "$env_file" 2>/dev/null | tail -1; }
user=$(read_env JIRA_USER_EMAIL)
token=$(read_env JIRA_API_TOKEN)
base=$(read_env JIRA_BASE_URL)
base=${base:-https://koekalenteri.atlassian.net}

if [ -n "$user" ] && [ -n "$token" ]; then
  summary=$(curl -sf --max-time 5 -u "$user:$token" "$base/rest/api/3/issue/$key?fields=summary" |
    jq -r '.fields.summary // empty' 2>/dev/null)
  [ -n "$summary" ] && title="$key $summary"
fi

jq -n --arg title "$title" \
  '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", sessionTitle: $title}}'
