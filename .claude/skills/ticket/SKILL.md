---
name: ticket
description: Take one Jira issue from pickup to a reviewed pull request with green CI and no new Sonar issues. This session orchestrates; an implementer subagent does the work, reviewer subagents check it from separate angles, and a ci-watcher digs out every red check and Sonar finding. Use when the user hands over an issue key, e.g. "/ticket KOE-1490".
---

# /ticket <KEY>

This session is the orchestrator. It does not edit code. It routes work and feedback between
the agents defined in `.claude/agents/`, and checks the outcome from the source, not from their
reports. The gate is the pull request and the user's merge; nothing here approves or merges.

## 1. Pick up

- Read the issue with comments and attachments (images through the REST API).
- Move it to In Progress unless it is in Testing In Progress.
- If the cause is not obvious, find it once yourself, with evidence (dev data, logs, the code),
  before handing over. Do not send an open "investigate and fix" to the implementer.
- Anything only the user can unblock (a decision, a secret, a setting, production access): ask
  now, in one batch.

## 2. Plan

Start `implementer` in the background with `isolation: "worktree"`. Give it the key, the branch
name (`koe-<n>-<slug>`), the cause and how it was established, and what is already verified, and
ask for its plan first. It answers before its first edit with:

- the cause, confirmed or corrected;
- every place that reads or decides the same thing, with the `git grep` it ran and its output,
  each marked as changing or not, and why;
- the approach in a few sentences, naming any stored shape or shared rule it changes;
- the test that will fail without the change.

Check the reader list against the code yourself; one reader missed here costs a review round
later (#1507 found three, one per round). When the plan changes a shared rule, a flag or a stored
shape, run `reviewer` with `root-cause` and `rule-readers` on the plan (give them the plan text
and the key instead of a PR number) before any code exists.

Skip the plan when the change has one reader and nothing to choose, and say so in the handover.

## 3. Implement

Send the approved plan, with any corrections, to the same implementer through `SendMessage`.
It opens the PR as a draft. Wait for its report: the PR URL and the failing-test evidence.

## 4. Review and CI, in parallel

In one message, start in the background:

- `ci-watcher` with the PR number.
- `reviewer` once per angle, each with the PR number, the key and its angle. Choose the angles
  the change calls for: `root-cause` and `tests` always; `rule-readers` when a shared rule,
  flag or helper changes; `clock` when dates, times or fixtures change; `conventions` when new
  files or modules appear.

Reviewers start fresh every round. Do not pass them the implementer's report.

## 5. Feedback

When all have reported:

- Drop findings without a concrete scenario, merge duplicates, and sort by severity.
- Findings that belong to `main` (a test failing there too, a clock failure, a Sonar profile
  change): not the implementer's. Fix them in a separate PR without an issue key, or tell the
  user if the decision is theirs.
- Every open Sonar issue on the PR is a finding for the implementer, also when the gate is OK.
  The gate checks ratings, duplication and hotspots, not the issue count, so a PR with new code
  smells passes it (#1450 did with 8). Only an issue on a line the PR did not touch, or one from
  a rule SonarCloud just added, belongs elsewhere.
- A real bug the review finds outside the issue's scope (it predates the PR, or fixing it would
  change a shared rule the issue does not ask about): not the implementer's. Bring it to the
  user with the evidence and ask whether it gets its own issue. See "Follow-up issues" below.
- Send the rest to the implementer through `SendMessage` (its agent ID from step 2), as one
  package. Do not start a new implementer; its context is the point.

After its fix, run step 4 again with only the CI watcher and the reviewers whose findings were
addressed. At most three feedback rounds by default. When findings are still open after the
third, stop and ask the user whether to continue, with what is open and how the rounds went; go
on only with their permission, for as many rounds as they allow.

## 6. Ready and report

Check from the source, not from the agents' reports:

- `gh pr view <pr> --json state,isDraft,commits` and `gh pr checks <pr>`: every check passed.
- `api/qualitygates/project_status?projectKey=koekalenteri_koekalenteri&pullRequest=<pr>`:
  status `OK`, for the PR's last commit.
- `api/issues/search?componentKeys=koekalenteri_koekalenteri&pullRequest=<pr>&issueStatuses=OPEN,CONFIRMED`:
  `total` is `0`, or every remaining issue was sorted to `main` or `user` in step 5.
- Every review finding is fixed, or answered with evidence.

Only when all of these hold, mark the PR ready: `gh pr ready <pr>`. Otherwise it stays a draft
and the report says which item is missing.

Then tell the user: the PR and whether it is ready, what was wrong and what changed, the review
rounds and what they caught, CI state per check, the Sonar gate and issue count, out-of-scope
findings and the follow-up issues created for them, and anything open or waiting on them.

## Follow-up issues

When the user approves an issue for something found while working on `<KEY>`:

1. Check the finding against the code yourself before writing it; a reviewer's trace is not proof.
2. Search the open issues (`statusCategory != Done`) for one that already covers it. Read the
   candidates' descriptions and comments, not only the summaries. If one covers it, propose
   using that issue instead; if one is related, propose linking it.
3. Create the issue under the same epic as `<KEY>` unless another fits better, and say in the
   description that it was found while working on `<KEY>`, with the PR link.
4. Link it to `<KEY>` with "Relates" (`createIssueLink`), and to any related issue from step 2.
5. Comment on `<KEY>`: one line per new issue, linked, saying what it is and that the PR does not
   change it. A tester reading `<KEY>` must find the follow-ups there, not only in this session.

## Rules

- No CI, test or Sonar housekeeping issues in Jira; those PRs carry no issue key.
- Production only with the user's permission, also for reading.
- Agents never merge, queue, enable auto-merge or push to main.
- A PR is a draft until step 6 says otherwise. Only the orchestrator marks it ready, and before
  sending new work to a PR that is already ready, turns it back: `gh pr ready <pr> --undo`.
- Before sending a follow-up to a PR, check it is still open; a merged PR gets a new one from
  `origin/main`.
