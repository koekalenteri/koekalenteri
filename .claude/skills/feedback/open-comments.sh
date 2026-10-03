#!/usr/bin/env bash
# Issues in progress or in testing whose newest comments nobody has answered yet.
#
# Our own replies go out under the account in .env, and so do the CI's "Puskettu deviin ja
# testattavissa" comments. Those do not answer anyone, so they are skipped when finding the last
# reply; every other comment by someone else after the last reply is open.
#
# Usage: .claude/skills/feedback/open-comments.sh [days]   (default 30)
set -euo pipefail

root=$(git rev-parse --show-toplevel)
env_file="$root/.env"
[ -f "$env_file" ] || env_file="$(git -C "$root" worktree list --porcelain | awk 'NR==1 {print $2}')/.env"
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

days=${1:-30}
base=https://koekalenteri.atlassian.net/rest/api/3
me=$(curl -sf -u "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" "$base/myself" | jq -r .accountId)

curl -sf -G -u "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" "$base/search/jql" \
  --data-urlencode "jql=project = KOE AND statusCategory = \"In Progress\" AND updated >= -${days}d ORDER BY updated DESC" \
  --data-urlencode 'fields=summary,status,issuetype,comment' \
  --data-urlencode 'maxResults=100' |
  jq -r --arg me "$me" '
    def text: [.body | .. | .text? // empty] | join("");
    def reply: .author.accountId == $me and (text | startswith("Puskettu deviin") | not);
    .issues[]
    | . as $issue
    | (.fields.comment.comments // []) as $comments
    | ($comments | map(reply) | rindex(true)) as $last
    | ($comments | to_entries
        | map(select(.value.author.accountId != $me and ($last == null or .key > $last)))
        | map(.value)) as $open
    | select($open | length > 0)
    | "\($issue.key)\t\($issue.fields.status.name)\t\($issue.fields.issuetype.name)\t\($open | length)"
      + "\t\($open | map(.id) | join(","))"
      + (if $issue.fields.comment.total > ($comments | length) then "\tTRUNCATED" else "" end)
      + "\t\($issue.fields.summary)"'
