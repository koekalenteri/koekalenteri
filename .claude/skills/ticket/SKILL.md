---
name: ticket
description: Take one Jira issue from pickup to a reviewed pull request with green CI. This session orchestrates; an implementer subagent does the work, reviewer subagents check it from separate angles, and a ci-watcher digs out every red check and Sonar finding. Use when the user hands over an issue key, e.g. "/ticket KOE-1490".
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

## 2. Implement

Start `implementer` in the background with `isolation: "worktree"`. Give it the key, the branch
name (`koe-<n>-<slug>`), the cause and how it was established, and what is already verified.
Wait for its report: the PR URL and the failing-test evidence.

## 3. Review and CI, in parallel

In one message, start in the background:

- `ci-watcher` with the PR number.
- `reviewer` once per angle, each with the PR number, the key and its angle. Choose the angles
  the change calls for: `root-cause` and `tests` always; `rule-readers` when a shared rule,
  flag or helper changes; `clock` when dates, times or fixtures change; `conventions` when new
  files or modules appear.

Reviewers start fresh every round. Do not pass them the implementer's report.

## 4. Feedback

When all have reported:

- Drop findings without a concrete scenario, merge duplicates, and sort by severity.
- Findings that belong to `main` (a test failing there too, a clock failure, a Sonar profile
  change): not the implementer's. Fix them in a separate PR without an issue key, or tell the
  user if the decision is theirs.
- Send the rest to the implementer through `SendMessage` (its agent ID from step 2), as one
  package. Do not start a new implementer; its context is the point.

After its fix, run step 3 again with only the CI watcher and the reviewers whose findings were
addressed. At most two feedback rounds; what is still open after that goes to the user.

## 5. Report

Check from the source: `gh pr view <pr> --json state,commits`, `gh pr checks <pr>`, the Sonar
gate for the PR. Then tell the user: the PR, what was wrong and what changed, the review rounds
and what they caught, CI state per check, and anything open or waiting on them.

## Rules

- No CI, test or Sonar housekeeping issues in Jira; those PRs carry no issue key.
- Production only with the user's permission, also for reading.
- Agents never merge, queue, enable auto-merge or push to main.
- Before sending a follow-up to a PR, check it is still open; a merged PR gets a new one from
  `origin/main`.
