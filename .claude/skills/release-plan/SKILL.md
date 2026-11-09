---
name: release-plan
description: Plan what the next release should hold, by asking the user. Collects the candidate issues, groups them into areas of work by where the code changes, and asks which areas go in and in what order. Writes the answer to Jira (fixVersion) and to the release's plan document, which /design and /build continue from. Starts no code. Use for "mitä seuraavaan versioon", "suunnittele versio 2.3.0" or "/release-plan 2.3.0".
---

# /release-plan <version>

Phase 1 of three: `/release-plan` decides what the release holds, `/design` designs each area of
work as a whole and cuts it into pieces, `/build` builds the pieces. Each runs in its own session
and ends where the next one starts; the user's answer is the gate between them.

Issues are written from the user's point of view; how the work splits for building is decided
in `/design`, not here. This phase groups issues only far enough to ask a good question.

This session edits no code and starts no implementer. It changes Jira only as the user answers.

## 1. Collect

```
.claude/skills/release-plan/candidates.sh 'fixVersion = "<version>" OR (fixVersion is EMPTY AND statusCategory != Done)'
```

Section 1: one line per open issue in Jira rank order: key, status, type, priority, parent,
fixVersions, open blockers (`is blocked by`), what already holds it (an open PR whose title has
the key, or a local branch named `<key>-…`), summary. Section 2: every file each open PR changes.

Also:

- `ListAgents`: a peer session named after a key holds that key.
- What the user has already decided: the release's plan document if one exists (its link is
  on the last line of the Jira version's description), the release plan in memory, an epic's
  description. A decided order is not re-ranked.
- The version's own description in Jira (`/rest/api/3/project/KOE/versions`): the user's one line
  on what the release is for.

## 2. Group into areas

An **area** is a set of issues that change the same code: they share a hard path, a stored shape,
a table or a rule (`src/lib/*` read from both front and back), or one blocks another. Several
user stories often turn out to be one area; one story can also touch two.

For each issue, find where its change lands, at file level, in minutes, not a plan:

- Read the description and comments, and check on `origin/main` that the code still does what
  they say; an older change may have done part of it (KOE-1545 fixed three of KOE-1518's four
  places).
- `git grep` for the names the description gives; `git log origin/main --grep '<sibling key>'
  --name-only` for siblings already merged.
- Write the paths with the command that found them. When nothing narrows it, write `laaja`.

| Class | Paths | Meaning |
|---|---|---|
| hard | source, tests, `src/types/*`, `template/**/*.yaml`, migrations, `src/lambda/template.test.ts` | Two parallel changes conflict by meaning. |
| soft | `translation.json`, `src/generated/docs/index.ts`, `scripts/ratchet-baseline.json`, `package-lock.json`, `AGENTS.md`, `README.md`, `docs/**` | Conflicts in text only, settled mechanically. |

Join the hard paths from the data, not by eye: write `issue<TAB>path` lines to the scratchpad,
add section 2 as `#pr<TAB>path`, and group by `sort -k2 | uniq -D -f1`. Issues that meet on a
path are one area; an issue that meets an open PR's path is held back behind that PR.

## 3. Ask

One `AskUserQuestion` round, at most four questions:

- Which areas go in (multiSelect): per area its issues, one line on what it gives the user, its
  size (`pieni` / `keski` / `iso` by the footprint), and what it waits on.
- The order of the chosen areas, when it is not already decided: the recommended order first,
  with the reason (it unblocks others; security, data loss or privacy; small and independent).
- Issues of the version that fit no chosen area: keep in the version, or move to the next one.

When there are more areas than four options fit, ask about the large ones and propose the small
ones as one option. A question in prose goes unanswered; every question is in the prompt.

## 4. Record

- Jira: set or remove `fixVersion` as answered. Nothing else changes in Jira here.
- The plan document: one Claude Docs doc per release, named `<version>: suunnitelma`. Create it
  if the version has none, otherwise update it in place (read the Docs connector's guide first).
  This phase writes only its first section, **Sisältö**: a table of the areas in order (area,
  issues, what it gives the user, size, waits on), and under it the issues left out and why.
  `/design` adds a section per area and the table of pieces; `/build` keeps that table current.
- Put the document's link as the last line of the Jira version's description,
  `Suunnitelma: <link>`, keeping the user's own line above it. That line is how every later
  session finds the document; memory is not shared with a fresh session.

## 5. Report

The areas in order with their issues, what moved in Jira, and the document link. Then the next
step as a card the user pastes into a new session:

```
/design <version>
```

## Rules

- Asks, then records; never the other way round.
- An issue held by a PR, a branch or a session stays out of every area; the report lists it under
  "Jo käynnissä".
- Production only with the user's permission, also for reading.
