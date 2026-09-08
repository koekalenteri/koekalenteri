# Writing the guides

The markdown under `docs/` is the application's user guide, published from the same commit as the
code at `/ohjeet`. This file is for the agent that updates it — at release time through
`npm run docs-update`, or when a developer asks for a page — the way the root `AGENTS.md` is for
code work.

## Who reads it

- **Participants** (`ilmoittautujalle/`): a dog owner entering a trial, on a phone, once or twice a
  year. They do not know the application's vocabulary; they know their dog, the trial and the
  fee.
- **Trial secretaries** (`koesihteerille/`): a club volunteer running one or two trials a year,
  often with a year between them. They know the trial's steps well and the application only as
  far as it takes them through those steps.
- **Administrators** (`yhdistykselle/`): the club's treasurer or chair, reading about payments,
  agreements and user access.

Write for the reader's task, in the order the task happens, and say what the application does by
itself before what the reader has to do. Finnish first; the English page is a translation of the
Finnish one, not a page of its own.

## How a page binds to the code

Every binding fails the build rather than a reader, and `npm run check-docs` runs them all.

- **Controls are named by key.** A button, a tab, a menu item or a section heading is written as
  `{t:key}` from `src/i18n/locales/<language>/translation.json`, never as text: `**{t:save}**`.
  A renamed control renames itself in the guide; a removed one breaks the build. If a control's
  text is not in `translation.json`, say so in the Jira issue — the fix is to translate the
  control, not to write its name into the guide. Section headings that the application shows only
  in Finnish (`Osallistujat`, `Ilmoittautuneet`, `Peruneet`) are the one known exception; name
  them as shown and gloss them in the English page.
- **Pictures are visual test references.** `!shot[TestName/shot-name] Caption` on a line of its
  own shows `src/**/__screenshots__/TestName.visual.test.tsx/shot-name-chromium-linux.png`; a
  `shot-name-en` variant is preferred for the English page when it exists. A picture that is not
  a visual test's reference is not a guide picture: if a page needs a view nobody tests, the
  visual test comes first, in its own change, and the guide follows.
- **`covers` names the code the page describes**, as paths and globs. When a covered file changes,
  `npm run docs-coverage` and the release brief name the page. Keep `covers` honest: broad enough
  that a user-visible change hits it, narrow enough that a refactor of something else does not.
- **The English page carries `sourceHash`**, the digest of the Finnish body it was translated from.
  A changed Finnish page fails the build until the English one is retranslated and the hash
  renewed; `npm run build-docs` prints the digest the page is now.

## Reaching the page from the application

The header's help icon opens the guide for the view on the screen, from the route map in
`src/lib/client/docsContext.ts` (the event page picks its own page by whether entry has ended).
A new page for a view means a new line in that map, or the icon keeps pointing at the old page
or at nothing. Every page ends with the version it shipped with and a "this guide did not help"
link into the Service Desk form, filled in with the page, the version and the language.

## How to work

- **Only the pages the brief names.** A page whose `covers` the change does not hit is not part of
  the release, however tempting a tidy-up looks.
- **Read the code, not the old text.** The guide says what the application does now; the existing
  page is the previous release's claim and may be stale in exactly the place you are editing.
  Check every step against the component and the translation, and check every picture against
  what the text says is in it.
- **Both languages in the same change**, Finnish first, then the English translation with its
  `sourceHash`. Do not leave English for later; the build would not let the change in anyway.
- **Do not guess.** Where the code does not settle what to write — a flow you cannot follow, a
  rule you cannot find, a decision the club makes — leave a line starting with `TODO` saying
  exactly what is unsettled. `npm run check-docs` lists them for the developer; a guessed
  sentence is not listed anywhere.
- **Do not describe what does not exist.** No feature without a route and a component, no
  button without a key, no picture without a test.
- **Sentences, not slides.** The old PDFs were slide decks; the guide is prose with short sections,
  a table where three things line up, and a picture where the reader would otherwise have to
  imagine the screen.

## Release notes

`docs/<language>/uutta/<version>.md` says what changed for the reader in that release, and is shown
at `/uutta` and offered from the notice a reader gets after the application updated. Its
frontmatter is only the `date` (and `sourceHash` in the translation); the version is the file name.

- **The reader's words, not the commit's.** "Starttinumerot voi julkaista päivä kerrallaan", not
  "feat(admin): publish a multi-day class's start numbers one day at a time". Say what the
  reader can now do or no longer has to put up with; leave out refactors, dependency bumps and
  anything with no visible effect.
- **Group under `## Uutta`, `## Korjattu` and `## Nopeampaa`** (`New`, `Fixed`, `Faster`), in that
  order, and leave out a group that has nothing. Name controls with `{t:key}` like any page.
- **Draft, then write.** `npm run release-notes -- v<version>` writes both files from the commits
  with a `TODO` line at the top; the notes are done when the `TODO` is gone and the English
  `sourceHash` is renewed. A version bump without its notes does not pass `npm run check-docs`.

## The rules

`docs/fi/saannot/` is the Kennel Club's own text, extracted from its PDF by
`npm run build-rules` and never edited by hand: a wrong word there is a bug in the extraction
or in the PDF, not something to fix in the markdown. The frontmatter dates the rules edition,
not the application. There is no English text and none is written; the English index links
to the Finnish page. Guides and code link to a section by its anchor, `/ohjeet/saannot/<slug>#s-4-4`
for §4.4, rather than quoting it.

## Commands

| Command | What it does |
| --- | --- |
| `npm run build-docs` | writes `src/generated/docs/index.ts` from `docs/`; commit the result |
| `npm run check-docs` | the bindings, the generated module, links, `TODO`s and coverage; pre-commit and CI run it |
| `npm run docs-coverage -- --staged` | which pages a staged change concerns; pre-commit prints it as a hint |
| `npm run docs-update -- --since v1.11.2` | the release brief: pages, commits, issues; `--run` starts the session |
| `npm run release-notes -- v1.11.3` | drafts `docs/<language>/uutta/1.11.3.md` in both languages from the commits |
| `npm run build-rules` | extracts `docs/fi/saannot/noutajien-kokeet.md` from `docs/sources/*.pdf`; rerun for a new edition |
