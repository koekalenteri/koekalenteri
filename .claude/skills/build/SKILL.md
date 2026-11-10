---
name: build
description: Build a release's designed pieces as pull requests. Reads the table of pieces that /design wrote in the release's plan document, runs each piece through the /ticket flow (implementer, reviewers, CI watcher), up to three implementers at once, and keeps the table current so any later session can continue. Use for "toteuta palat", "/build 2.3.0" or "/build 2.3.0 <area>".
---

# /build <version> [area]

Phase 3 of three (`/release-plan`, `/design`, `/build`). Each piece of the plan document's table
**Palat** becomes one PR. This session orchestrates exactly as in `/ticket`
(`.claude/skills/ticket/SKILL.md`); read it first. Everything there holds unless this file says
otherwise. The unit of work is a piece, not an issue.

## 1. Read the state from the sources

- The plan document: its link is the last line of the Jira version's description
  (`Suunnitelma: <link>`). Without a table of pieces, stop and say `/design <version>` comes
  first.
- The table is a record, not the truth. Before anything starts, recompute every row from the
  sources and correct the table where it differs:
  - branch: `git branch -a --list '*-p<k>-*'` by the piece's id `P<k>`;
  - PR: `gh pr list --head <branch> --state all --json number,state,isDraft`;
  - status: `suunniteltu` (no branch), `työn alla` (branch, no PR), `katselmoinnissa` (open PR),
    `mainissa` (merged); `odottaa päätöstä` stays while the piece's question under **Avoimet
    päätökset** in the document has no answer (step 5).
- `ListAgents` and `git worktree list`: a peer session on a key or a branch holds that piece.
- `.claude/skills/release-plan/candidates.sh 'fixVersion = "<version>"'` for the open PRs'
  files; a piece whose hard path an open PR outside the plan holds waits for it.

A session that stopped mid-release (closed, compacted, crashed) continues by running `/build`
again; nothing it needs lives only in its conversation.

## 2. Pick what starts

A piece is ready when every piece it waits on is `mainissa`, or `katselmoinnissa` in the same
area (then it branches from that piece, see step 4). At most **three implementers at once**, one
per area: the pieces of an area go to the same implementer, in order, so its context carries the
design. Reviewers and CI watchers are not counted.

Implementers share the machine: vitest one run at a time, the e2e ports one session at a time,
scratch files named after the branch.

## 3. Build a piece

Run `/ticket` steps 2–6 for it, with these differences:

- **Plan:** the design's piece is the approved plan. The implementer confirms the readers against
  the code (`git grep` with output) and commits the failing test before reporting. Plan reviewers
  run only when it found a reader or a contract the design missed; then the design section in
  the document is corrected too.
- **Branch:** `koe-<n>-p<k>-<slug>`, where `<n>` is the first issue the piece advances or
  completes and `P<k>` the piece's id. `candidates.sh` sees the issue as held through the
  branch name, also before a PR names it.
- **PR title:** the keys of the issues this piece **completes**, and nothing else, plus a parent
  story's key when the piece completes its last open sub-task. A piece that only advances issues
  has no key in its title (`feat(results): stored shape for team totals`); its body says
  "Osa KOE-x:ää" in a sentence, which `claimedKeys` (`scripts/lib/jira.mjs`) does not count as a
  claim. So `jira-testable` moves an issue only when its last piece lands. Never an epic's key.
- **Jira:** an issue moves to In Progress when its first piece starts. The comment with the PR
  link goes on with the piece that completes it, and lists the earlier pieces' PRs.
- **Review:** the reviewers get the issue folders and the design section of the area as well as
  the PR. `scope` judges the piece against its row in the table: what it builds and nothing more.

Update the piece's row when its branch, PR and status change; that is what the next session reads.

## 4. Pieces that wait on an open PR

CI runs only for PRs into main (`.github/workflows/ci.yml`), and `delete_branch_on_merge` is on.
A piece whose predecessor in the same area is still in review branches from the predecessor's
branch and opens its PR into main as a draft, with "Sisältää #<n>:n; mergeä #<n> ensin" in the
body. Its reviewers get the range `<predecessor head>..<piece head>`. A fix to the predecessor
is merged into the piece's branch. When the predecessor lands, the implementer merges
`origin/main` (a merge commit, no force-push), the range becomes the whole diff, and the draft
turns ready by `/ticket` step 6.

## 5. A question parks its piece, not the session

`AskUserQuestion` holds the whole session until the user answers, and the user is often away for
hours: after a question at 23:08 on 9.11.2026, the session started no piece and passed on no
finished one until 04:22. So a decision only the
user can make, which `/ticket` would ask at once, parks the piece it belongs to instead:

- Write it under **Avoimet päätökset** in the plan document: the piece, the question, the options
  with what each changes, and your recommendation. Set the piece's status to `odottaa päätöstä`.
- Its implementer stops on that piece and its area waits; the other areas, reviews and CI
  watchers go on, and every ready piece that does not wait on the parked one starts as usual.
- Ask with `AskUserQuestion` when nothing else can advance (every running agent has reported and
  no ready piece is left), or as soon as the user writes in the session. Ask every open question
  in that one round, four to a call. Record each answer in the document, clear it from **Avoimet
  päätökset**, and send it to the area's implementer through `SendMessage`.
- A question about the product (a stored shape, a name, a behaviour the issues leave open) is one
  `/design` should have asked. Correct the area's design section with the answer, so the next
  release's design sees what was missed.

What `/ticket` stops for regardless (a fourth feedback round, production access) waits the same
way: parked, then asked in the round.

## 6. Generated content on merge

A file both pieces change by hand orders them (step 2). Generated docs content does not:
`src/generated/docs/index.ts` and an English page's `sourceHash` line. When a PR conflicts only
there, its implementer merges `origin/main`, takes main's side of the generated file, runs
`npm run build-docs`, renews the `sourceHash` of each page whose Finnish body changed, and pushes
once `npm run check-docs` passes. That update starts no review round: it goes to the implementer
and the `ci-watcher`, not to the reviewers. When a guide page's own text conflicts, it is a
by-hand change after all, and the `docs` reviewer looks at the merge.

## 7. Report

One row per piece: area, what it builds, PR, status, the issues it completes, and what is open.
Then what waits on the user: the PRs ready to merge in the order the table needs them, and the
open decisions, asked with `AskUserQuestion` before the report (step 5). When every piece of the release is `mainissa`, say so,
and list the issues whose status Jira has not moved. Nothing here merges.
