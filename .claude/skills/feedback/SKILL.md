---
name: feedback
description: Go through the comments testers and users have left on Jira issues that are in progress or in testing, and react to each one — answer a question, start a fix for a finding, or bring a decision to the user. Fixes run through the same implementer, reviewers and CI watcher as /ticket. Use for "katso tikettien kommentit ja reagoi niihin" or "/feedback".
---

# /feedback [days]

This session orchestrates, as in `/ticket` (`.claude/skills/ticket/SKILL.md`). It reads, sorts
and answers; code changes go to implementers.

## 1. Find what is open

```
.claude/skills/feedback/open-comments.sh [days]
```

One line per issue: key, status, type, number of open comments, their comment ids, `TRUNCATED`
when the search left comments out (then read the issue's `/comment` endpoint), summary. A comment
is open when it comes after our last reply; the CI's "Puskettu deviin" comments are not replies.
Epics are included: their comments are often the ones that ask something.

## 2. Read each one in full

For every listed issue read the open comments and the thread before them, with
`?expand=renderedBody` or the issue's rendered fields. Download every attachment the comments
show or link (`/rest/api/3/attachment/content/<id>`) and look at it; a `blob:` image in a comment
is an attachment, not something unreadable. Link to the environment the tester used (dev, test)
and read the state there when it settles the question. Production only with the user's
permission, also for reading.

## 3. Sort

Each open comment is one of:

| Kind | Example | Action |
|---|---|---|
| Question | "Mikä tuo Viesti estetty testiympäristössä on?" | Answer it yourself, step 4. |
| Finding | "Ei toimi: CTA väittää että starttilista on julkaistu, mutta…" | Fix, step 5. |
| Decision for the user | "voidaanhan me tehdä koekutsun lähettäminen pakolliseksi" | Collect for the user, step 6. |
| New request | a link to a new issue, "vielä pieni lisäparannus" | Nothing to build here; mention it to the user if it changes this issue's scope. |
| No action | thanks, chat, "ei kiireellinen" | Note it in the report. |

A comment can hold several of these; split it. When unsure whether something is a finding or
works as designed, find out from the code before deciding, and say which in the answer.

## 4. Answer questions

Verify every claim in the answer from the code or the data first, and the links too (the repo is
`koekalenteri/koekalenteri`). Write in the app's Finnish: its terms from `translation.json`,
not code names. Every reference is a Markdown link (`AGENTS.md`, Jira Automation). If the honest
answer is "it cannot be done yet", say so and what would change it; promise follow-up only when
something is actually going to happen.

## 5. Fix findings

For each finding, find the cause once yourself with evidence, as in `/ticket` step 1. Then run
`/ticket` steps 2–5 for it, with these differences:

- One implementer per issue, all in the background at once, each in its own worktree. Several
  findings on one issue go to the same implementer.
- If the issue has a PR still open (`gh pr list --search "<KEY> in:title" --state open`; without
  `in:title` the search also returns PRs that only mention the key), the implementer adds commits
  to that branch. Otherwise a new branch and PR from `origin/main` with the same key.
- The fix's PR title names the issue the comment was on, also when the change itself belongs to
  another issue. That is how the tester hears it is on dev: `jira-testable` comments on every key
  in the merged title, also on an issue in Testing In Progress (it just does not move it).
- Merging puts the change on dev only; the test environment gets it with the next pre-release.
  Say "dev" in the comment, not "testi- ja kehitysympäristö".
- The reviewers and the CI watcher run per PR as in `/ticket` step 3.
- The Jira comment for a fix goes on when the PR is open and links it; it answers the tester's
  comment: what was wrong, what changed, what to try.
- An issue in Testing In Progress is not moved. Anything else is moved to In Progress before the
  first edit.

## 6. Bring decisions to the user

Collect every decision into one list before answering anything that depends on it: the issue,
who asked, the question in one line, the options and what you would recommend. Post the answer to
the comment only after the user has decided, and say it was their decision.

## 7. Report

Per issue: what was asked, what you did (answered / PR / waiting on the user / no action), with
links. Check the PRs and comments from the source before reporting them.
