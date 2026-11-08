---
name: next
description: Plan what to work on next. Reads the open Jira issues of the coming release, what is already held by an open PR, branch or session, and the files those PRs touch; groups the free issues into bundles that run one after another inside a bundle and in parallel across bundles without conflicting files. Ends with a short why and one copy-paste /tickets card per bundle. Starts nothing. Use for "mitä seuraavaksi", "suunnittele seuraava kierros" or "/next".
---

# /next [scope]

This session plans only. It edits no code, starts no implementer, moves no Jira issue and
writes no Jira comment. The result is a list the user reads and cards they paste into
`/tickets` sessions. Jira bookkeeping (fixVersion, epic, links) only when the user asks.

`scope` is a JQL clause, e.g. `fixVersion = "2.3.0"` or `parent = KOE-176`. Without one, use the
unreleased versions in order (`fixVersion in unreleasedVersions(KOE)`); `earliestUnreleasedVersion`
is not safe, because a version shipped from git can still be unreleased in Jira (2.1.0 was, 8.11.2026).

## 1. Collect

```
.claude/skills/next/candidates.sh '<scope>'
```

Section 1, one line per issue in Jira rank order: key, status, type, priority, parent, fixVersions,
open blockers (`is blocked by`), what already holds it (open PR `#n` or a local branch named
`<key>-…`), summary. Section 2: every file each open PR changes.

Then, in the same step:

- `ListAgents`: a peer session named after a key holds that key too.
- The user's decided order, if one exists: the release plan in memory, an epic's description, a
  planning document. A decided order wins over anything this skill would infer. When a conflict
  keeps an issue from starting in that order (its files wait for an open PR), the output puts the
  issues that can start first and says so in the why, naming the decided position and the PR.
- For issues with `Ready for Testing` or `Testing In Progress`: nothing to plan, list them under
  "Odottaa testausta". Their merged PR still counts in step 3 if the release has not shipped.

An issue is **free** when its status is a backlog status, nothing holds it, and no open blocker
remains. Everything else goes to the "Jo käynnissä" or "Estetty" list with the reason.

## 2. Footprint

For each free issue, find where the change will land, at file level. Spend minutes, not a
plan: the implementer's plan step does the full reader search later.

- Read the description and comments, then check on `origin/main` that the named code still
  does what it says. An older change may have fixed part of it (KOE-1545 fixed three of
  KOE-1518's four places); the card says what is left.
- Look at what siblings touched: `git log origin/main --grep '<sibling key>' --name-only` for
  merged issues under the same parent, and section 2 for open ones. Race bugs under one epic
  tend to share the same handler and lib module.
- `git grep` for the names the description gives (handler, table, atom, translation key).
- Record the paths and the command that found them. When nothing narrows it, write `laaja` and
  treat the issue as conflicting with everything in its area (`src/lambda`, `src/pages`,
  `template`).

Each path is one of:

| Class | Paths | Meaning |
|---|---|---|
| hard | source, tests, `src/types/*`, `template/**/*.yaml`, migrations, `src/lambda/template.test.ts` | Two parallel PRs on it conflict by meaning; put them in one bundle or in order. |
| soft | `src/i18n/locales/*/translation.json`, `src/generated/docs/index.ts` (`npm run build-docs`), `scripts/ratchet-baseline.json` (`npm run ratchet`), `package-lock.json`, `AGENTS.md`, `README.md`, `docs/**` | Conflicts in text, resolved mechanically on rebase. Parallel is fine; the card says how to resolve. |

A stored shape, table, index or shared rule (`src/lib/*` used from both front and back) is hard
even when the files differ: the second PR must read the first one's result.

## 3. Bundle

A bundle is a sequence one `/tickets` session runs in order. Put issues in the same bundle when
any holds:

- one blocks the other, or they are sub-tasks of one story;
- their hard footprints overlap;
- the second needs the first's stored shape or rule.

Order inside a bundle: blocker first, then the decided order, then the one whose change the
others build on.

Then check every pair of bundles, and every bundle against section 2:

- No hard path shared between two bundles. When one is, merge the bundles or mark the second
  "aloita kun <bundle> on mainissa".
- A hard path an open PR touches: the bundle waits for that PR (`#n`), or its card says to
  rebase on it first. Do not plan a second change to a file whose open PR is still in review.
  Before deciding, read that PR's hunks in the file (`gh pr diff <n>`): a hunk that only moves a
  constant far from the planned change is soft, not hard (#1776 in `src/lambda/lib/event.ts`).
- Run the overlap from the data, not by eye: write the footprints as `bundle<TAB>path` to the
  scratchpad and join them with section 2 (`sort | uniq -d` on the path column). The card's
  "Rinnakkain" line is that output.

Keep bundles small: three to five issues, one area. A bundle that crosses frontend, backend and
template is a sign the footprint guessed wide; look again before accepting it.

## 4. Why

Rank the bundles and say why in a sentence each, from these in this order:

1. The user's decided order and the release the issue is in.
2. It unblocks others (open `Blocks` links, sibling sub-tasks).
3. Priority and security (the security epic, data loss, privacy).
4. Small and independent: it fills a parallel slot without conflicts.

## 5. Output

Answer in Finnish, in the chat, in this shape:

````
## Seuraavaksi

<2–4 lauseen perustelu: mihin julkaisuun tähdätään, mikä on kriittinen polku, montako
rinnakkaista kaistaa on tarjolla ilman konflikteja.>

| Nippu | Laput | Alue | Rinnakkain | Odottaa |
|---|---|---|---|---|
| A | KOE-1521 → KOE-1524 | starttilistan julkaisu | B, C | – |
| B | … | … | A, C | #1776 |

### Nippu A: <aihe>
```
/tickets KOE-1521 KOE-1524
```
- Järjestys: KOE-1521 ensin, koska <syy>.
- Koskee: src/lambda/…/handler.ts, src/lib/startList.ts, template/tables/event-table.yaml
- Pehmeät: translation.json (avaimet Biome-järjestyksessä käsin), docs/fi/secretary/trial-day.md
- Rinnakkain: B, C. Ei samaan aikaan: D (src/lib/startList.ts).
- Odottaa: – (tai: #1776 mainissa)
- Selvitetty: <mitä tämä sessio jo totesi ja millä komennolla>
````

The fenced block holds only the `/tickets` call, so it pastes as is. `/tickets` takes keys in
order (`/tickets KOE-1521 KOE-1524`), a range (`/tickets KOE-1704..1711`) or an epic
(`/tickets KOE-176`, its open children). Use the range when the bundle is a contiguous run of
keys in that order, and the epic only when every open child of it is free and in this bundle;
otherwise list the keys. The lines under the block are for the user, not for the paste.

Then three short lists: "Jo käynnissä" (key → PR or session), "Estetty" (key → blocker or the
user's decision it waits for), "Odottaa testausta".

Every key in a card is free by step 1. Before answering, run `candidates.sh` once more if more
than a few minutes have passed: a peer session may have opened a branch meanwhile.

The output is the answer. It ends without a question: nothing here asks whether to start a
bundle, which order to take or whether to go on. An issue that needs the user's decision before
it can be bundled goes to "Estetty" with the decision it waits for.

## Rules

- Plans only. No code, no agents for implementation, no Jira transitions or comments.
- Never executes: the cards are for the user to paste, and nothing in this skill asks to start one.
- A decided order from the user is not re-ranked; an issue moves only when its files wait for an
  open PR, and the why says so.
- An issue held by a PR, branch or session is never in a card.
- A footprint is a guess with its command next to it; the `/tickets` implementer's plan step
  corrects it. Say `laaja` rather than guess narrow.
- Production only with the user's permission, also for reading.
