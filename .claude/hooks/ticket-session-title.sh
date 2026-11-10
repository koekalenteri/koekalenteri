#!/usr/bin/env bash
# UserPromptSubmit: "/ticket KOE-1490" names the session "KOE-1490 <summary>". The summary
# comes from Jira with the credentials in .env; without them, or when Jira does not answer in
# time, the session is named by the key alone. "/release-plan 2.3.0", "/design 2.3.0 <area>",
# "/build 2.3.0" and "/improve 2.3.0" name it by the version and the phase: "2.3.0
# julkaisusuunnitelma". Any other prompt passes through untouched.
set -u

input=$(cat)
prompt=$(jq -r '.prompt // ""' <<<"$input")
line=$(head -n 1 <<<"$prompt")
current=$(jq -r '.session_title // ""' <<<"$input")

phase=$(sed -nE 's/^[[:space:]]*\/(release-plan|design|build|improve)[[:space:]]+([0-9][^[:space:]]*).*/\1 \2/p' <<<"$line")
if [ -n "$phase" ]; then
  read -r skill version <<<"$phase"
  case $skill in
    release-plan) title="$version julkaisusuunnitelma" ;;
    design) title="$version suunnittelu" ;;
    build) title="$version toteutus" ;;
    improve) title="$version retro" ;;
  esac
  [ "$current" = "$title" ] && exit 0
  jq -n --arg title "$title" '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", sessionTitle: $title}}'
  exit 0
fi

key=$(sed -nE 's/^[[:space:]]*\/ticket[[:space:]]+([A-Za-z]+-[0-9]+).*/\1/p' <<<"$line" | tr '[:lower:]' '[:upper:]')
[ -n "$key" ] || exit 0

title=$key
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
