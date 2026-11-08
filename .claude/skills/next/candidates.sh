#!/usr/bin/env bash
# Open issues in a scope, with what already holds each one, and the files every open PR touches.
#
# Section 1, one line per issue in Jira rank order:
#   key  status  type  priority  parent  fixVersions  blockedBy  inFlight  summary
# blockedBy lists open issues linked "is blocked by". inFlight is the open PR (#n) or the local
# branch whose name starts with the key, so the issue is already someone's.
#
# Section 2, one line per open PR: "#n<TAB>branch<TAB>file" for every file it changes. These are
# the paths a new bundle must not collide with.
#
# Usage: .claude/skills/next/candidates.sh ['<JQL clause>']
#   default: fixVersion in unreleasedVersions(KOE)
set -euo pipefail

root=$(git rev-parse --show-toplevel)
env_file="$root/.env"
[ -f "$env_file" ] || env_file="$(git -C "$root" worktree list --porcelain | awk 'NR==1 {print $2}')/.env"
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

scope=${1:-'fixVersion in unreleasedVersions(KOE)'}
base=https://koekalenteri.atlassian.net/rest/api/3
jql="project = KOE AND statusCategory != Done AND issuetype != Epic AND ($scope) ORDER BY Rank ASC"

prs=$(gh pr list --state open --limit 100 --json number,title,headRefName)
branches=$(git -C "$root" for-each-ref --format='%(refname:short)' refs/heads)

echo "## issues ($scope)"
token=''
while :; do
  page=$(curl -sf -G -u "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" "$base/search/jql" \
    --data-urlencode "jql=$jql" \
    --data-urlencode 'fields=summary,status,issuetype,priority,parent,fixVersions,issuelinks' \
    --data-urlencode 'maxResults=100' \
    ${token:+--data-urlencode "nextPageToken=$token"})
  jq -r --argjson prs "$prs" --arg branches "$branches" '
    ($branches | split("\n")) as $br
    | .issues[]
    | .key as $k
    | ($k | ascii_downcase) as $lk
    | ([$prs[] | select(.title | test("\\b" + $k + "\\b")) | "#\(.number)"]
       + [$br[] | select(startswith($lk + "-"))]) as $held
    | [.fields.issuelinks[]?
       | select(.type.name == "Blocks" and .inwardIssue != null
                and .inwardIssue.fields.status.statusCategory.key != "done")
       | .inwardIssue.key] as $blocked
    | [$k, .fields.status.name, .fields.issuetype.name, (.fields.priority.name // "-"),
       (.fields.parent.key // "-"), ([.fields.fixVersions[].name] | join(",") | if . == "" then "-" else . end),
       ($blocked | join(",") | if . == "" then "-" else . end),
       ($held | join(",") | if . == "" then "-" else . end), .fields.summary]
    | @tsv' <<<"$page"
  token=$(jq -r '.nextPageToken // empty' <<<"$page")
  [ -n "$token" ] || break
done

echo
echo "## open PR files"
jq -r '.[] | "\(.number)\t\(.headRefName)"' <<<"$prs" | while IFS=$'\t' read -r n ref; do
  gh pr diff "$n" --name-only | sed "s|^|#$n\t$ref\t|"
done
