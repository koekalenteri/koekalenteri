---
name: design
description: Design each area of work in a release as a whole and cut it into pieces sized for building, independent of how the Jira issues were split. Reads the release's plan document from /release-plan, writes a design per area and the table of pieces that /build runs. Starts no code. Use for "suunnittele kokonaisuudet", "/design 2.3.0" or "/design 2.3.0 <area>".
---

# /design <version> [area]

Phase 2 of three (`/release-plan`, `/design`, `/build`). Issues say what the user gets; a
**piece** is what one PR builds. They seldom match: three stories can share one data change, and
one story can need a backend piece before its screen. This phase designs the area once and cuts
it where building wants the cuts.

This session orchestrates, as in `/ticket` (`.claude/skills/ticket/SKILL.md`). It edits no
application code and starts no implementer.

## 1. Read

- The plan document: its link is the last line of the Jira version's description
  (`Suunnitelma: <link>`). Read its Sisältö section: the areas, their issues, the order. Without
  a document, stop and say `/release-plan <version>` comes first.
- With `area`, design that one; otherwise every area not yet designed, in the document's order.
- Save every issue of the area once, as `/ticket` step 1 does (`<scratchpad>/<KEY>/issue.json`
  and attachments), and find each bug's cause yourself, with evidence.
- Run `.claude/skills/release-plan/candidates.sh 'fixVersion = "<version>"'` again: what is held
  now, and the files of every open PR.

## 2. Design the area

Start one `Plan` agent per area in the background, at most three at once. Give it the issue
folders, the causes found, the open PRs' files, and ask for, in this order:

- **Current state:** every place that reads or decides what the area changes, with the
  `git grep` and its output.
- **Design:** the stored shapes, rules, modules and screens the area ends with, where each goes
  by "Library Organization" in `AGENTS.md`, and what goes away. One design for the area, not one
  per issue: a helper two issues both need is designed once.
- **Pieces:** an ordered list. For each: what it builds, the hard paths it changes, the test that
  fails without it, its size in changed lines (estimate), what it needs from earlier pieces (the
  contract: type, field, signature, rule), and per issue whether it **advances** or **completes**
  it.
- **Open questions:** every choice the implementer would otherwise have to ask the user while
  building: a stored shape or field, a name or label the user sees, a limit or default, a
  behaviour the issues leave open. For each, the piece, the options and a recommendation.

Cut the pieces by these rules:

1. **Main stays releasable after every piece.** A release can be cut from main at any time, and
   there are no feature flags. Data and backend first, the screen that shows it last. A piece
   that cannot be made invisible joins the piece that makes it usable.
2. **Size:** about 700 changed lines at most (three quarters of KOE PRs are below that), one
   area of the code. Generated files and screenshot baselines do not count.
3. **One reason to change per piece:** a migration, a rule, a screen. A piece that crosses
   frontend, backend and template is cut again, unless rule 1 forbids it.
4. **Each issue is completed by exactly one piece**, the last one it needs. That piece claims the
   issue; earlier pieces only advance it.

Then review the design as one, with `reviewer` on the design text (no PR number): `architecture`
and `complexity` always, `root-cause` when the area holds a bug, `scope` when it asks for
something new, `rule-readers` when a shared rule, flag or stored shape changes. Settle the
findings as `/ticket` step 5 does, and send the agreed ones back to the same `Plan` agent.

## 3. Parallel and order across areas

Pieces of one area run one after another, by one implementer (its context is the point). Areas
run in parallel only when no hard path is shared: write `piece<TAB>path` for every piece and
`#pr<TAB>path` for the open PRs, and join with `sort -k2 | uniq -D -f1`. A shared hard path puts
the later area's piece behind the earlier's; a path an open PR holds puts the piece behind that
PR. Soft paths never order anything: `/build` settles them on merge.

## 4. Record and ask

Write into the plan document, in place:

- a section per area: current state, design, the contracts between pieces, and the review
  findings and how they were settled;
- the table **Palat**, one row per piece: id (`P<k>`, numbered through the release, never
  reused), area, what it builds, issues it advances, issues it completes, branch (empty), PR
  (empty), waits on (pieces and PRs), status (`suunniteltu`). `/build` reads and writes this table; nothing else does.

Then one `AskUserQuestion` round: approve the design per area (or what to change), and every
open question the `Plan` agents listed. A question `/build` meets later stops only its piece but
waits for the user (`/build` step 5), so a product choice left for the build costs hours. Record
the answers in the design sections before reporting; a question still open goes under **Avoimet
päätökset** with its piece at `odottaa päätöstä`.

## 5. Report

Per area: the pieces in order, which issue each completes, what runs in parallel, and what waits
on an open PR. Then the card:

```
/build <version>
```

## Rules

- The design is a guess until an implementer confirms the readers in `/build`; say `laaja` when
  a footprint does not narrow, rather than guess narrow.
- No Jira changes here, except Blocks links between issues that the design shows the user agreed
  to.
- Production only with the user's permission, also for reading.
