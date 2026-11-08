---
name: tickets
description: Take several Jira issues that depend on each other from pickup to reviewed pull requests in one go. Issues that have to be done one after another form a chain that one implementer builds into one PR, a commit per issue; independent chains run in parallel, up to three implementers. Use when the user hands over several keys, a key range or an epic, e.g. "/tickets KOE-1704..1711" or "/tickets KOE-1704 KOE-1706".
---

# /tickets <KEY…>

For issues split so small that they cannot be done in parallel: each needs what the one before
it adds. Running `/ticket` on them one by one waits for the user's merge at every step and pays a
plan, a review round and a CI run per issue. Here the whole chain is one piece of work.

This session orchestrates exactly as in `/ticket` (`.claude/skills/ticket/SKILL.md`); read it
first. Everything there holds unless this file says otherwise. The unit of work is a **chain**,
not an issue: one implementer, one branch, one PR.

Arguments: issue keys, a range (`KOE-1704..1711`), or an epic or story key (its children that are
not Done).

## 1. Pick up

- Typing `/tickets <KEY…>` names the session by its first key and the number of the others
  (`KOE-1704 <summary> (+7)`), through the same hook as `/ticket`.
- Run `/ticket` step 1 for every issue: save it to `<scratchpad>/<KEY>/issue.json` with its
  attachments, note bug or new, find each cause once yourself. Move an issue to In Progress when
  its chain's implementer starts, not before.
- Run `ListAgents` and `git worktree list`, and look for an open PR per key
  (`gh pr list --search "<KEY> in:title" --state open`). An issue that already has a session or
  PR is left out; whatever depends on it waits for its PR to land.
- Build the dependency graph in `<scratchpad>/graph.json`. Edges come from the Jira **Blocks**
  links (`blocks` / `is blocked by`) between the issues, and from what you find in the code and
  the descriptions: B reads a field, a module or a rule that A adds or changes. Mark each edge
  `jira` or `inferred`, with the reason. A cycle means the split is wrong; ask.
- Group the graph into chains: issues joined by any edge, directly or through others, are one
  chain. Issues with no edge to the others are each a chain of their own, and run through
  `/ticket` steps 2–6 unchanged.
- Ask the user once, with `AskUserQuestion`, before any implementer starts: the chains, their
  order inside each, and the inferred edges. Write the approved inferred edges to Jira as Blocks
  links (`createIssueLink`); a tester reading one issue must see what it waits on.
- When a chain is big (more than about six issues, or its plan touches several areas that do not
  share code), propose a split into two chains whose first lands before the second starts.

## 2. Plan the chain

One implementer per chain, started as in `/ticket` step 2, with every issue folder of the chain,
the order, the edges with their reasons, and one branch name (`koe-<first key>-<slug>`). It
plans the whole chain before the first edit:

- per issue, in order: the cause, the readers (`git grep` with output), the approach, the test
  that fails without it, where each new piece goes;
- per edge A→B, the contract between them: the type, field, function signature or rule that A
  leaves and B uses. That is what keeps B's part from being redone when A changes in review;
- the shared files several issues touch (`translation.json`, generated docs, screenshot
  baselines) and which commit changes each;
- the guide pages and developer docs for the files of the whole chain.

It commits the first issue's failing test before it reports, as in `/ticket`.

Review the plan as one: every plan angle that any issue of the chain calls for in `/ticket` step
2 runs once on the whole plan. `architecture` and `complexity` always run on a chain's plan:
small issues each adding their own helper or layer is the typical cost of a split that was too
fine, and it is visible only across them.

## 3. Implement

The implementer builds the issues in order, **one commit per issue**: the commit's title carries
that issue's key (commitlint caps a commit header at 100 characters), its body the cause. Each
issue gets its own Jira comment with the PR link when the PR opens: what was wrong, what changed,
what to try.

The PR title lists every key of the chain, plus a parent story's key when the chain ends its last
open sub-task: `feat(results): … (KOE-1704, KOE-1705, KOE-1706)`. With two or more commits the
merge queue squashes under the PR title, which commitlint does not check, so the keys fit;
`jira-testable` moves every key it finds there. The body has one section per issue.

## 4. Review and CI

As `/ticket` steps 4–5, on the one PR. Each reviewer gets every issue folder of the chain. The
angles are the union of what each issue calls for. `rule-readers` and `scope` judge each issue
against its own commit and the chain as a whole: a reader that one commit leaves for the next one
to fix is a finding when no later commit fixes it.

Fixes come as new commits on the branch, not as amendments to the issue's commit; the squash
merges them anyway.

## 5. Parallel chains

Independent chains run at the same time, **at most three implementers at once**. More chains
than that wait in the order the user approved and start as soon as an implementer's PR is ready.
Reviewers and CI watchers are not counted: they run per PR as in `/ticket`.

Before starting chains in parallel, compare their plans' shared files. Two chains that both
change a generated file (`src/generated/docs/index.ts`, a docs page's `sourceHash`) conflict in
the merge queue (#1678 and #1679); start the second only after the first is merged, or move the
file's change to one of them.

Implementers share the machine: vitest one run at a time (each implementer runs its tests in the
foreground and waits for any other), and the e2e ports one session at a time. Scratch files are
named after the branch.

## 6. Ready and report

`/ticket` step 6 per PR. The report has one row per issue: its chain, its PR, its state (draft,
ready, waiting on another chain or on a peer session's PR), and what is open; then the merge
order when one chain's PR has to land before another starts. Nothing here merges.
