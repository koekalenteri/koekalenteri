#!/usr/bin/env bash
# UserPromptSubmit: "/ticket KOE-1490" names the session "KOE-1490 <summary>", and
# "/tickets KOE-1704 KOE-1705" or "/tickets KOE-1704..1711" names it by the first key with the
# number of the others: "KOE-1704 <summary> (+7)". The summary comes from Jira with the credentials
# in .env; without them, or when Jira does not answer in time, the session is named by the key
# alone. Any other prompt passes through untouched.
set -u

input=$(cat)
prompt=$(jq -r '.prompt // ""' <<<"$input")
line=$(head -n 1 <<<"$prompt")
key=$(sed -nE 's/^[[:space:]]*\/tickets?[[:space:]]+([A-Za-z]+-[0-9]+).*/\1/p' <<<"$line" | tr '[:lower:]' '[:upper:]')
[ -n "$key" ] || exit 0

# The others /tickets names: every further key, and a range's end minus its start.
others=0
if [[ $line =~ ^[[:space:]]*/tickets[[:space:]] ]]; then
  keys=$(grep -oiE '[A-Za-z]+-[0-9]+' <<<"$line" | wc -l)
  others=$((keys - 1))
  while read -r start end; do
    [ -n "$start" ] && [ "$end" -gt "$start" ] && others=$((others + end - start))
  done < <(grep -oiE '[A-Za-z]+-[0-9]+\.\.[0-9]+' <<<"$line" | sed -E 's/.*-([0-9]+)\.\.([0-9]+)/\1 \2/')
fi
suffix=
[ "$others" -gt 0 ] && suffix=" (+$others)"

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
title=$title$suffix

jq -n --arg title "$title" \
  '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", sessionTitle: $title}}'
