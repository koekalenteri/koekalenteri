# Agent Notes

Read `LLM_CONTEXT.md` for the project overview and architecture notes.

## Test Gotchas

- For focused frontend Vitest runs, pass the test path and `--run`:
  `npm run test-frontend -- --run <paths...>`
- Focused runs should include `--run` to disable watch mode.
- Frontend typecheck is `npm run lint-frontend`.
- Use `git diff --check` before finishing edits to catch whitespace issues.
- `npm run test-integration` runs the `integration` project: the lambda code against real tables in a
  DynamoDB-local (`npm run init-dynamodb`, or `DYNAMODB_ENDPOINT` for one on another port). The tables
  are created from `template/tables` at the start of every run, empty, under the access key
  `integration`, so the `npm run init` tables and the browser tests' rows are never touched (a
  container started with `-sharedDb` keeps no databases apart, and the run refuses to reset there). The tests
  are `src/lambda/**/*.integration.test.ts`, beside the module they run; each writes under ids of its
  own and asserts on those, never on a table's whole content. Never part of `npm test` or the
  pre-commit hook; CI runs them in the `integration` job with the container as a service (KOE-1369).

### A green run is a quiet run

- Anything a test writes to `console.error` or `console.warn` fails that test, in every project
  (`src/test-utils/consoleGuard.ts`, set up from each project's setup file). An act() warning, a MUI
  prop mistake or a rejected fetch is a defect in the test or the component; fix it there. The
  lambdas' `info` and `debug` lines are silenced in the backend project, so a passing run prints
  nothing (KOE-1439).
- A test that expects output says so: `expectConsoleOutput(/pattern/)` before the code that writes
  it. Every declared pattern must then match a line and every line must match a pattern, so a
  declaration is an assertion, not a mute. The other way is the lambda tests' own:
  `vi.spyOn(console, 'error').mockImplementation(() => {})` and reading the lines back with
  `loggedLines(spy)`; a spy installed at file level is left alone.
- "not wrapped in act(...)" after the test ends comes from timers a file runs in `afterEach`
  (`vi.runOnlyPendingTimers()` fires a ripple's exit and a snackbar's auto-hide): use
  `runPendingTimers()` / `runAllTimers()` from `src/test-utils/utils`, which run them inside act.
  The same warning before the test ends means a render settles asynchronously (an atom resolving):
  `await flushPromises()` after the render.
- The one warning declared rather than fixed: "This library called use() to suspend in a previous
  render but did not call use() when it finished" — a React 19 note that `adminEventAtom` flips
  from a promise to a plain value once the list has loaded, which it does by design.

## Mocking Gotchas

- Mock only boundaries whose behavior the test must control or observe, such as network calls, AWS services, persistence, authorization, secrets, clocks, randomness, or side-effect publishers.
- Do not mock deterministic local functions merely to simplify a test or its expected value. Formatting, parsing, mapping, and other pure domain helpers should run as production code; assert their real output instead. Examples include `formatMoney`, `getProviderName`, HMAC calculation, and Paytrail error parsing.
- At handler boundaries, mocking an already-tested shared workflow is acceptable when the handler test is specifically about delegation. Test the real workflow in its owning `src/lambda/lib/*.test.ts` suite.
- When an ESM module mock must provide an unrelated named export only because Vitest replaces the whole module, keep that export minimal and do not use the stub as evidence that the real behavior works. Prefer real implementations or a narrower boundary when practical.
- API module mocks live under `src/api/__mocks__/`. If a mocked API export needs `mockResolvedValue` or similar test control, update the global mock there to export a `vi.fn()` instead of working around it with a local spy.
- `src/api/__mocks__/email.ts` exports `sendTemplatedEmail` as a Vitest mock function, so tests can use:
  `const mockSendTemplatedEmail = sendTemplatedEmail as MockedFunction<typeof sendTemplatedEmail>`

## Library Organization

- Before adding a file under `src/lib/` or `src/lambda/lib/`, look for an existing module that owns the same domain and extend it when the responsibility remains cohesive.
- Avoid narrowly named parallel helper files for variants of one workflow, such as `paymentCreation.ts` and `paymentCancellation.ts`, when the code belongs naturally in `payment.ts`.
- Create a new library file only when it represents a clearly separate, reusable responsibility or a meaningful dependency boundary. Name it after the domain concept rather than a one-off operation or implementation detail.
- A domain folder under `src/lambda/lib/` (`repositories/`, `stats/`, `ws/`) keeps a `README.md`, and where that README has a "Public interface" section (`stats/`), code outside the folder imports only what it lists.
- New table access goes into the table's repository in `src/lambda/lib/repositories/`, not into a handler or a domain module: one module per table with its client at module level, functions named by purpose, keys and indexes written only there. Add the function to the existing repository, or create `<table>Repository.ts` for a table that has none yet; `src/lambda/lib/repositories/README.md` has the convention and the list of all 17 tables. A `CustomDynamoClient` reaches only the table it was built on; a write across tables is `documentTransaction` in the primary table's repository. `npm run ratchet` fails a commit that opens a DynamoDB client outside the repositories, whether a `CustomDynamoClient` or an SDK client built directly, as far as the file's static imports show it, and a repository may build only one `CustomDynamoClient`, on its own table written as `CONFIG.<table>Table`; the count is 0 (KOE-1405, KOE-1415, KOE-1576).
- `@/` is the source root (`tsconfig` paths, the webpack alias and the vitest alias all declare it). Under `src/pages`, an import that would climb three or more directories names the file from `@/` instead (`@/types`, `@/lib/event`, `@/__mockData__/events`); one or two levels stay relative. Lambda code does not use the alias: esbuild reads `src/lambda/tsconfig.json`, which does not declare it.

## Hook Files

- A file named after a hook (`useX.ts`, `useX.tsx`) exports that one hook. A second hook gets its own
  `useY.ts` beside it, even when it only wraps the first; a context or type both need is exported
  from the file that defines it (`useWebSocketContext.ts` reads `WebSocketContext` from
  `useWebSocket.ts`).
- The state modules that bundle a domain's action hooks (`src/pages/**/state/**/actions.ts`,
  `src/pages/state/events/hooks.ts` and the like) export several `use*` hooks by design and stay as
  they are.

## Calendar Days

- A calendar day (the day a trial runs, an entry opens or closes, a dog is placed on) is a `DayKey`
  (`src/types/Day.ts`): `yyyy-MM-dd`, no zone. `isDayKey` (`src/lib/day.ts`) narrows what comes from
  storage or a URL, `toDayKey(year, month, day)` builds one. Days compare and sort as text.
- A day becomes a moment, and a moment a day, only in `src/lib/day.ts`: `dayOf(instant, zone)`,
  `dayStart(day, zone)`, `dayEnd(day, zone)`, `shiftDays(instant, days, zone)`, and the readers of an
  instant built on them: `dayStartOf(instant, zone, days = 0)` (the start of the day the instant falls
  on, or of one `days` from it), `dayEndOf`, `sameDay`, `yearOf`, plus `yearStart`, `yearEnd` and
  `currentYear`. `monthKeyOf(day)` is a day's `yyyy-MM`. `localStampToInstant(stamp, zone)` reads a
  stamp without a zone (Kennelliitto writes those) as the wall-clock time it is in the zone, and
  `isInstantString` accepts only an ISO instant with an explicit zone on a day there is. The zone is a required parameter, never a default; the trials' zone is
  `TIME_ZONE` from the same module. Day arithmetic (`addDays`, `addMonths`, `daysBetween`, `eachDay`,
  `dayOfWeek`, `monthsBetween`, `latestDayMonthsBefore`) needs no zone at all. `monthsBetween` counts
  whole calendar months as `addMonths` steps them: a month is reached on the day of the month it
  started on, or on the last day of a shorter month (31.7. to 30.4. is nine months), which is not how
  date-fns `differenceInMonths` counts at month ends. `latestDayMonthsBefore(day, n)` is the last day
  from which `n` months have passed by `day`, the bound a picker offers for the same rule.
- The browser's day, which MUI's pickers read and write, is `localDayOf(date)` and `localDateOf(day)`
  (a local midnight) in the same module; check `hasLocalDay(date)` first, since a half-typed picker
  value or Kennelliitto's empty date has none.
- `dayOf` throws on an instant without a calendar day. Check `hasCalendarDay(instant, zone)` first on
  anything stored or received: the Kennel Club's empty date (year 1) is a valid Date but no day, and
  the accepted years (1100 to 9899) leave room for every step the app takes from an accepted day.
- Every calendar day a row stores is a `DayKey` (KOE-1547): an event's days (its own, the entry's, the
  classes', the dates', the posts', the Kennelliitto trial's, the published-day lists), a
  registration's days and groups' days, a dog's birth date and results' days, and an organizer stats
  row's key. Rows stored before held instants (a Finnish midnight, the end of a Finnish day, a
  browser's local midnight or noon of a dog's date) or Kennelliitto's stamps; the `store...DaysAsKeys`
  migrations rewrite them. An event's or an entry's day stored an hour off (a winter midnight worked
  out in summer time is 23:00 the evening before) is the day it was stored for (`storedEventDayOf` in
  `src/lib/day.ts`); a dog's date is the day its instant falls on. Until every environment has run
  them and every browser sends keys, the readers accept both forms. Two rules read them. Everything
  that decodes a day into a key uses the migrations' rule: the migrations, a copy, and a request
  reading its stored row and what it receives (`legacyEventDay`, `requestDay`,
  `legacyRegistrationDays` in `src/lib/storedDays.ts`), so a request writes the day the migration
  would. A browser on the bundle before KOE-1547 sends back the Dates it read, and the rule reads each
  as that day: an unmigrated row's instant, a key read as UTC midnight, a picker's Finnish midnight.
  The display readers, `storedDayKey` and `eventDayKey` (`src/lib/event.ts`) and `calendarDayOf`, read
  the day an instant falls on and the day a stamp without a zone names; a dog's date is decoded by
  that rule too (`legacyStoredDay`, the one body both use). The migrations run right after
  `sam deploy`; until they finish, a few minutes, an hour-off row may show or compare by its old day,
  which is accepted. A no-day result date is stored as `''`, a no-day birth date not at all. The
  browser model holds the same keys (KOE-1547), and so the bodies it sends are keys. The wire reads an
  event's or an entry's day by the migrations' rule (`eventDay` in `lib/wire.ts`, `legacyStoredEventDay`),
  so an unmigrated row's instant, or one a cache or a draft of the bundle before held, comes into the
  model as the key the migration writes. The model compares days as keys and today as
  `dayOf(new Date(), TIME_ZONE)`; a moment is made of a day only where one is needed, such as the
  countdown to the end of the entry's last day (`dayEnd`).
- The day key indexes (`gsiSeasonStartDate`, `gsiEventTypeEntryEndDateV2`) are queried with day keys,
  which sort by day as text; the organizer stats rows' upper bound is padded past the event id
  (`yyyy-MM-dd#id`).
- date-fns' calendar functions (`isSameDay`, `startOfDay`, `addDays`, `nextSaturday`, `subWeeks`,
  ...) read the day in the machine's zone, and so do `format` with day tokens and `parseISO` of a day
  key. Biome's `noRestrictedImports` bans them outside `src/lib/day.ts` (`format` and `parseISO` also
  in `src/i18n/dates.ts`); format a moment with `formatDate`, read a day key with `dayStart` after
  `isDayKey`. Instant functions (`isValid`, `isAfter`, `differenceInMinutes`,
  `formatDistanceToNowStrict`, `lightFormat` of a build time) stay allowed. A line that must keep a
  calendar call carries a `biome-ignore` with the reason and the issue that moves it. `*.test.*` files
  are exempt; `src/__mockData__` and `src/test-utils` are not. Biome override options replace rather
  than merge, which is why `biome.json` repeats the date-fns block in every override that sets
  `noRestrictedImports`.
- `getFullYear`, `getMonth`, `getDate` and `getDay` on an instant are calendar calls too, in the
  machine's zone, and Biome has no rule for them: read the day with `dayOf`, `yearOf` and `dayParts`.
  `localDayOf` is the one sanctioned reader of a browser-zone day. The pickers take and give day keys
  (KOE-1548): a picker gets `localDateOf(day)`, and only the day it shows comes back (`pickedDayOf`),
  so no time of day or zone reaches the event form, the search filter or the registration form;
  `src/pages/components/dayPicker.ts` holds what they share. The search filter's `start` and `end` are
  the day keys of the URL, and the event form stores the picked keys as they are (KOE-1547).
- A dog's birth date (`Dog.dob`) and a result's date (`TestResult.date`, and so the qualifying and the
  hand-entered results) are day keys in the browser and are written as keys. Rows stored before hold
  older forms: Kennelliitto's stamp without a zone, a bare day, an instant a browser or a lambda wrote.
  `calendarDayOf(value, zone)` reads any of them as a day (an instant as its day in the zone), and
  `localCalendarDayOf` reads an instant as the browser's day, for what the same browser stored (a draft,
  the dog cache: `toStoredRegistration`, `toStoredDog` in `lib/wire.ts`). Both answer undefined for
  Kennelliitto's empty date in every form. `GetDogFunction` stores Kennelliitto's days as keys, and
  `hasRegistrationChanges` compares the dog's dates by day, so an old row saved unchanged stays a 304.
- Tests run in the machine's zone (Helsinki on a laptop, UTC in CI). A fixture is a Finnish day:
  `startOfFinnishDay('2026-10-17')` from `src/test-utils/finnishDays.ts`, never `new Date(2026, 9, 17)`.
  A test of zone handling runs under `describeInTimeZone` (`src/test-utils/timeZone.ts`).

## Data Migrations

- A one-off data migration is an entry in one of the migration lists of
  `src/lambda/RunMigrationFunction/handler.ts`, one per table (events, users, registrations, dogs,
  organizer stats rows): a `name` plus an idempotent, synchronous `run(row, context)` that mutates the
  row and returns whether it changed, or a `DayRekeying`, which also says the row held a day it could
  not read. `context` is what the run reads once before any row (today the organizer repoint of
  KOE-1580, from the organizer table and the events as read). Only the tables with a pending
  migration are read, and the registration table is read an event's rows at a time. Each table's
  migrations are recorded when that table's run has written every row.
- A migration that left values it could not read answers with `unreadable`, names the rows in the
  log and is not recorded as applied, so the next deploy runs it again; the deploy step warns about
  it. A migration that leaves rows it cannot decide about adds `skipped(rows, context)`: the run
  answers and logs their ids in one warning, and still records the migration.
- A migration that decodes the old stored days does it with `legacyDecoder` (`legacyStoredEventDay`
  and `legacyStoredDay` in `src/lib/day.ts`), which never narrows: the hash below covers the
  migration's own text, not a helper's.
- The event migrations read the deleted rows too, so one that gives a row an index key (`season`,
  `organizerId`) returns false for a row with `deletedAt`: a deleted event stays out of the indexes it
  was never in (KOE-1585).
- `userMigrations` in the same file migrate the user table, applied, hashed and recorded alike, and
  may change only `roles`, which is all the runner writes of a user (on condition the roles are still
  the ones read) besides an `updatedAt` bump, so the user list's incremental fetch hands the row to
  clients that cache it; `modifiedAt` stays. The changed users' scopes get one `users` data version
  bump, also when a later write fails. The users run first, before the event migrations.
- An event migration that changes the organizer moves the organizer stats row (ORG#) to the new
  organizer and the event's start as migrated before the event is written, so a failed move leaves the
  event for the next run to find. A start rekeyed alone is moved by `storeOrganizerStatsDaysAsKeys`.
- The deploy runs it, nobody runs it by hand: after `sam deploy`, the `Run data migrations` step of
  `deploy-backend` in `release.yml` invokes the function directly (`aws lambda invoke`, no
  `requestContext`, so no Cognito check) and prints the counters. A failed run fails the job before
  the frontend is published. The step makes one attempt (`AWS_MAX_ATTEMPTS=1`): the CLI retries a
  read that timed out, which would start a second run beside the first.
- Applied migrations are recorded in the data version table (collection `migrations`, scope = the
  migration's name, fields `appliedAt`, `count` and `hash`; every environment has its own table). A
  deploy runs only the migrations whose row is missing or whose stored `hash` differs from the hash of
  `run.toString()`, and with none pending it reads the registry once and never touches a table. So an
  applied migration does not run again, and **a changed migration body reruns by itself**. Two limits
  are accepted: the hashed text is the bundled code, so an esbuild or dependency change can alter it
  without a source change and rerun a migration once (harmless, migrations are idempotent); and a
  change inside a helper the migration calls (`getEventSeason`, say) does not alter it, so a migration
  whose behaviour changes through a helper **needs a new name**.
- Each modified row is written with the condition that its `updatedAt` is still the one read (or that
  it had none; a dog row, which has none, with its dates as read, and an organizer stats row moved in
  a transaction a concurrent count cancels), so a secretary's save is never overwritten: on a conflict
  the row is read again, migrated again and retried, at most three attempts. The organizer stats table
  is the exception: its move is retried as a save's move of the row is, by `ORGANIZER_STATS_MOVE_RETRY`
  (eight attempts with a jittered wait between them). If they run out the invocation fails (non-200),
  records nothing, and the next deploy picks the migrations up. A mark never overwrites an earlier one
  with the same hash.
- `POST /admin/migrate` (admin-only) stays a forced run of every migration, for a correction run
  (a wrong season, say), and leaves the registry as it is when the hashes match. A migration must therefore stay safe to re-run.
- Copying events from prod into dev or test never copies the data version table, so the receiving
  environment's registry may already list migrations as applied that its new rows still need: run the
  forced `POST /admin/migrate` after such a copy.
- Do not write a data migration as a repo script or npm command. The KOE-1266 start number backfill
  started as `scripts/backfill-start-numbers-published.mjs` and was moved into the lambda to keep
  the practice uniform.
- The lambda bumps `updatedAt` on every modified row before writing, so an individual migration
  never touches it — the incremental fetch (`changedSince` in `src/lambda/lib/incremental.ts`)
  reads `updatedAt`, and a row rewritten without moving it would never reach clients that already
  hold the event. `modifiedAt` stays untouched: it records a user's edit, which a migration is not.
- `scripts/migrate.sh` and `aws/README.md` cover a different job — copying whole tables between
  stacks — not changing data in place.

## Post-deploy Smoke Check

- Every deploy `release.yml` makes (dev from ci.yml's `deploy-dev`, test, prod) ends in the `smoke`
  job (`scripts/smoke-deploy.mjs`, KOE-1368): the front page must answer 200, every script it loads
  from its own origin must answer 200 as JavaScript, and `GET /event` must answer a JSON array. When the run built the frontend, the page must also carry the `app-version` and
  `app-revision` metas of that build (written into `public/index.html` by `config/webpack.config.js`)
  and preconnect to the stack's `KoekalenteriFunctionApi`. A red smoke on dev fails `deploy-dev`, so
  `jira-testable` does not run.
- Of the build's settings only `REACT_APP_API_BASE_URL` is compared (through the preconnect link). A
  stale user pool, client id, OAuth domain, WebSocket URL or RUM setting passes the smoke check.
- The CI `frontend` job checks the same stamp on its own build, so removing or renaming a meta fails
  there first. Keep the names in step with the script.

## Visual Test Convention

- When you change or create a user-visible component, ensure it has a screenshot test
  (`*.visual.test.tsx` beside the component). If one does not exist, create it in the same change.
- Visual tests run in a real browser with real Finnish translations via `npm run test-visual`
  (the `visual` vitest project picks up `src/**/*.visual.test.tsx` anywhere). Wrap the capture in a
  fixed-width, opaque `data-testid` frame and the app `ThemeProvider`; see
  `src/pages/admin/eventResultsPage/ResultsTable.visual.test.tsx` for the pattern.
- Generate both platform baselines: `npm run test-visual -- <TestName> -u` (darwin) and
  `npm run test-visual-linux -- <TestName> -u` (linux, via Docker). The pre-commit hook refuses a
  commit that updates one platform's baseline without the other.
- Name the relevant KOE issue keys in the commit message: on push, the `jira-screenshots` workflow
  attaches the changed linux baselines to those Jira issues, so the ticket always shows the current
  look of the components it covers.
- A capture the guide shows (`!shot[Test/name]` under `docs/`) has an English twin, `name-en`, taken
  by the same test inside a `describeInLanguage('en', …)` block (`src/test-utils/language.ts`); the
  English guide shows that one, and `npm run check-docs` fails without it (KOE-1437). Pass the
  language on to the frame's MUI and date-fns locales where the test sets them, as App.tsx does.

### A DOM dump is not an acceptable test

- `expect(container).toMatchSnapshot()` (or `container.firstChild`, `baseElement`, `asFragment()`) is
  not a test anyone can read a failure from — a false positive on every refactor, and no record of
  what it was actually checking. KOE-1315 spent thirteen tickets replacing 67 of these: a screenshot
  (`*.visual.test.tsx`) for the visual concern, a role/text/value assertion for the behavioral one.
  A data snapshot — a plain object, array, or rendered string, not a rendered container — is still
  fine; `toMatchSnapshot`/`toMatchInlineSnapshot` on those is unaffected.
- `npm run check-dom-snapshots` (`scripts/checkDomSnapshots.js`) enforces this on every commit,
  alongside `check-screenshots`: it scans each staged test file's lines for `toMatchSnapshot`/
  `toMatchInlineSnapshot` called on one of the four DOM-dump targets above, and rejects the commit
  if it finds one. An explicit allowlist inside the script names the eleven files that already
  hold legitimate data snapshots (KOE-1315's own accounting), so touching one of those for an
  unrelated reason never trips the check.

### A screenshot test is also an accessibility test

- `toMatchScreenshot` is wrapped in `src/setupVisualTests.ts`: after the image comparison passes, the
  captured element is audited with axe-core. There is nothing to call — taking a picture runs the
  audit, so a component that only a visual test covers cannot skip it. A screenshot test is
  therefore the place a missing `aria-label`, an unlabelled field or a bad contrast is caught.
- The audit runs *after* the comparison on purpose. `expect.element` polls the matcher until the
  screenshot matches, so a DOM still settling is retried rather than reported; auditing first made a
  disabled button's contrast come and go between runs.
- Known violations are ratcheted per test file and screenshot in `scripts/a11y-baseline.json`
  (`scripts/a11yRatchet.mjs`), the same model as the assertion ratchet above. **A rule with more
  nodes than its allowance fails the test**, and the failure names the rule, the Deque help page and
  every failing element with axe's own fix advice. Fewer nodes lower the allowance in the file, so
  the numbers only ever go down; commit the lowered baseline with the fix.
- Raising an allowance is a hand edit of the baseline, visible in review. Seeding it, or accepting a
  violation that was decided to stay (one inside a library component, say), is
  `A11Y_RATCHET=record npm run test-visual -- --run`, which writes whatever the run finds.
- The page-level `region` rule is off: a component fragment has no landmarks, and that is the page's
  business, not the component's.

## Jira Automation

- Taking an issue up as work starts with moving it to In Progress (transition it before the first
  edit), unless it is in Testing In Progress — a tester's round in flight keeps its state, and the
  fix rides on it as a comment. Ready for Testing does move back: the work has reopened.
- A commit *claims* an issue by naming its KOE key in the subject line or on a body line of nothing
  but keys (the footer convention). A key cited mid-sentence ("the KOE-85 gate") is context only.
- When the CI `deploy-dev` job succeeds on a push to main, the `jira-testable` job moves every
  claimed issue still in a development state to Ready for Testing and comments the deployed commits
  on it (`scripts/jira-mark-testable.mjs`). Issues already in testing keep their state and only get
  the comment; done issues are left alone.
- So: write the issue a comment about the work once the commit is pushed, and leave the testability
  signal to the pipeline. The comment carries what the automation cannot — what was actually wrong,
  what changed, and what the tester should try — and never claims the change is testable; the
  `jira-testable` job says that when the deploy is through. Do not comment before the push: the
  tester starts from the comment, and there would be nothing deployed to start on.
- The `jira-screenshots` attach workflow intentionally matches keys anywhere in the message —
  attaching an image to a context-cited issue is harmless, moving it would not be.
- A comment says nothing about deployment mechanics. New Lambdas, CloudFormation changes and the
  like go out with the deploy on their own; a "note for the deploy" asks the reader to do something
  that nobody has to do, and it has confused people. Leave it out — of comments and of the pushed
  summary alike.

### Every reference in a Jira comment is a link

- Asked for by the testers: an issue key, a commit or a file named in a comment must be clickable.
  Write them as Markdown links and post with `contentFormat: "markdown"` — the converter turns them
  into real ADF link marks:
  `[KOE-740](https://koekalenteri.atlassian.net/browse/KOE-740)`,
  `[90a933ee](https://github.com/koekalenteri/koekalenteri/commit/90a933ee)`,
  `[EventDescription](https://github.com/koekalenteri/koekalenteri/blob/main/src/pages/components/EventDescription.tsx)`.
- A bare `KOE-740` in an ADF comment stays plain text — Jira does not linkify keys the way the old
  wiki renderer did.
- Do **not** put code in a link: `` [`90a933ee`](url) `` silently drops the href and leaves bare
  monospace. Pick one — for a reference, the link.
- `scripts/jira-mark-testable.mjs` builds its comment the same way: the sha links to the GitHub
  commit and the subject's keys to their issues. `--dry-run` prints the ADF it would post.

## Adding a Lambda

- A new lambda is a directory `src/lambda/<Name>Function/` with a `handler.ts`, and one entry in
  `template/functions/`. Nothing else: `scripts/build-template.mjs` writes the
  `<Name>FunctionLogGroup` (30 days) for every function that does not declare one, and knip finds
  the handler through the `src/lambda/*Function/handler.ts` glob rather than a hand-kept list.
- A function that needs a different retention writes its own log group block, and the build leaves
  it alone -- the payment and refund functions keep their logs for 180 days that way.
- `src/lambda/template.test.ts` builds the template and compares its `CodeUri` values with the
  directories on disk, so a lambda in one and not the other fails a test instead of a deploy.
- The function block's `Policies` must grant every table the handler's code reaches, and nothing
  more. The same test follows the calls from each handler's default export, and from the module-level
  code that runs when the handler and the files it imports load, through every file under `src` they
  reach (`src/lambda/test-utils/lambdaTableUse.ts`, KOE-1557) and reads the block's policies
  (`src/lambda/test-utils/templateGrants.ts`, KOE-1492). Code that runs at import counts without its
  function bodies: a function it calls, or writes out as an argument, runs its own body there, and
  one it stores or returns first is not followed; the module's header lists what it does not model.
  It fails on a table the code uses without a policy for that action, naming the function, the
  action, the table (or the index, for a query on one) and the call chain, like this one from PutEvent with its registration read policy taken out:
  `PutEventFunction Query on EventRegistrationTable without a policy: src/lambda/lib/registration.ts:617
  (putEventLambda > findKcGuidLock > getRegistrationsByEventId)`. It also fails on an excess grant,
  a read or write class on a table the code never touches (`PutJudgeFunction may read JudgeTable but
  never does`): fix the template, not the test. Note that SAM's `DynamoDBWritePolicy` has no
  DeleteItem and no ConditionCheckItem; a delete or a transaction condition needs
  `DynamoDBCrudPolicy`, and the excess test accepts the crud grant's read class on such a table
  since no write template can carry it. A function that calls `authorize()` carries `- !Ref AuthorizePolicy`
  (`template/policies/authorize-policy.yaml`) for the user, user link and data version tables; a
  broadcast needs `- !Ref WebSocketPolicy`.
- The same walk names the environment variables the code reads (`process.env.X`), and the same test
  fails on a variable a function reads that neither the Globals nor its own `Environment` block set,
  naming the read and its call chain (`PaymentVerifyFunction reads REGISTRATION_EDIT_TOKEN_SECRET
  without setting it: src/lambda/lib/secrets.ts:164 (paymentVerifyLambda > getRegistrationEditToken >
  getRegistrationEditTokenSecret)`, KOE-1605), and on a variable a function sets that the walk sees
  other functions read but this one never does. CONFIG's reads in `config.ts` are left out (they run
  at import in every handler and all have defaults), and the variables nothing sets by design
  (`AWS_SAM_LOCAL`, `NODE_ENV`, ...) are listed in the test with the reason. The walk refuses a
  `process.env` read it cannot name (a computed key, `process.env` handed on whole).
- A CloudWatch alarm (`AWS::CloudWatch::Alarm`) carries `Condition: IsNotTestStage`, and
  `AlarmActions` and `OKActions` on `- !Ref AlarmTopic` (`template/alarm-topic.yaml`), which mails
  the stack parameter `AlarmEmail` (the repository secret `ALARM_EMAIL`). Test has no alarms; dev's
  and prod's mail when they fire and when they clear. `src/lambda/template.test.ts` fails on an
  alarm without them (KOE-1602).
- Every metric series is billed per month, so an alarm reads one AWS gives for free (AWS/Lambda
  Invocations or Errors of a function, the API stage's 4XXError and 5XXError) or a metric filter's,
  and the code publishes none of its own. API Gateway's per-method detailed metrics
  (`MetricsEnabled: true` in `template/api.yaml`) are five billed series per method and stack; a
  method's throttle works without them, and `src/lambda/template.test.ts` fails on one and on an
  alarm that reads a method's series (KOE-1649).
- A custom metric is published under the stack, never in a namespace the stacks share: dev, test
  and prod are stacks in one account, and a shared namespace makes one metric of all three, so a
  stage's alarm fires on another stage's events. An `AWS::Logs::MetricFilter` publishes to
  `MetricNamespace: !Sub 'KoekalenteriApp/${AWS::StackName}'`, and an alarm on its metric reads the
  same `Namespace`. `src/lambda/template.test.ts` fails on a filter or alarm that does not.

## Lambda Logging

- Lambdas do not call `console.*`; `suspicious/noConsole` is an error under `src/lambda/**`, with
  `lib/log.ts` as the only exception. Use `logger` from `src/lambda/lib/log.ts`:
  `logger.info('locations written', { count: locations.length })`.
- One line is one JSON object: `level`, `message`, the context, and whatever fields the call passes.
  The message is a fixed string — put the varying parts in the fields, so Insights can filter and
  count on them instead of matching free text.
- The `lambda()` wrapper puts `requestId` and `service` (the name given to `lambda()`) on every line
  the handler writes, through an `AsyncLocalStorage`; the three WebSocket handlers set the same
  context themselves and add `connectionId`. Nothing needs to be threaded through call arguments.
- An `Error` is passed as a field (`{ error }`) and unpacked into name, message and stack; plain
  `JSON.stringify` would have turned it into `{}`.
- No personal data in a log line. A user is identified by `userId`; where an email is the only handle
  there is, `hashIdentity(email)` gives a stable non-reversible one. Names and email addresses stay
  out.
- Two CloudWatch metric filters match a phrase in a message (`registrations it could not attribute to
  a capacity class`, `data version drift repaired`). Keep those phrases intact when editing the line.

All the lines of one request, oldest first:

```
fields @timestamp, level, message, @message
| filter requestId = 'abcd1234-...'
| sort @timestamp asc
```

Errors per API over the selected range:

```
fields service
| filter level = 'error'
| stats count(*) by service, message
| sort count(*) desc
```

## Static Analysis (Sonar)

SonarQube runs on every push and its findings have cost this repo ~40 follow-up commits.
Below is what it has actually raised here, most frequent first. Write it this way the first
time instead of fixing it in a second commit.

### Complexity — the bulk of the churn

- **Cognitive complexity (S3776)** is the single most common finding. A handler that decides
  *and* does I/O *and* merges, all nested in one loop, will trip it. Split the decision out of
  the loop: name the classification (`classifySubmission`), then let the loop only write.
  Real examples: `putEventResults`, `putEventLambda`, `buildStatsRecords`, `useWebSocket`,
  `http.ts` retry, `refundCreate`, `putRegistrationGroups`, `getEventProgress`.
- **Nested ternaries.** Never chain `a ? x : b ? y : z`. Use `let` plus `if` / `else if`, or lift
  the chain into a named function (`getTemporalPhaseIndex`, `getEntryPhaseLabel`).
- **Repeated subexpressions.** If the same `x ?? (y ? a : b)` appears twice, bind it to a const
  once and use the const — Sonar flags the duplication and the code reads better.
- **Repeated inline types.** Three signatures sharing `DogEventCost | number | undefined` becomes
  one `type EventCostInput`. Same for repeated `keyof JsonRegistration`.
- Prefer extracting a guard into a named predicate (`isInvalidMoveAnchor`, `shouldRetryRequest`)
  over an `if` with six `||` operands.

### Mechanical TypeScript idioms

- `??` instead of `||` whenever the fallback is for null/undefined, not falsiness.
- Optional chaining instead of `a && a.b`. But check the semantics first: `a?.b !== c` is *not*
  the same as `a && a.b !== c`, and chaining a comparison can make two missing values compare
  equal. When the chain would change behaviour, leave it and say so in the commit message.
- `arr.at(-1)` instead of `arr[arr.length - 1]`.
- `arr.some(pred)` instead of `Boolean(arr.find(pred))`.
- `str.replaceAll('-', '+')` instead of `str.replace(/-/g, '+')`.
- A constant membership list that is only ever tested with `includes` should be a `Set` with
  `.has()`.
- `reduce` always gets an explicit initial value, even when a length guard makes it safe.
- Do not spread a nullish fallback: `{ ...(x ?? {}) }` becomes `{ ...x }`, or
  `x ? { ...x, regNo } : { regNo }` when the fallback is not empty.
- `x !== undefined`, not `typeof x !== 'undefined'`, unless the identifier may be undeclared.
- Prefer the positive condition: `a === b ? [] : [id]` over `a !== b ? [id] : []`.
- Use `forEach` for side effects; `map` whose result is discarded is a finding.
- Never interpolate an unvalidated `unknown` into a string — `String(value)` on an object yields
  `"[object Object]"`. Narrow to `string` first and reject anything else.

### Promises and async

- **Do not `await` a non-thenable (S4123).** Synchronous Jotai atoms, plain values and
  `Promise.all` over non-promises all trip this. Read synchronous atoms directly and await only
  what is genuinely asynchronous.
- Reject with an `Error`, never with a bare string or object.
- **No floating promises (S9383).** Biome's `noFloatingPromises` enforces this, but it misses
  async Jotai setters, which Sonar still flags. Inside an async function, `await` the call. In a
  sync handler, write `void promise.catch(reportError)` when it can reject, or plain `void` when it
  cannot or already handles its own errors: `navigate(...)`, cached-collection setters, the
  publishing handlers.
- **No `await` inside a loop (S9382).** Rows that do not depend on each other fan out through
  `mapWithConcurrency` (`src/lib/utils`), never a bare `Promise.all` over a map: the rows of one
  event share a DynamoDB partition, so registration writes take `REGISTRATION_WRITE_CONCURRENCY`
  from `src/lib/registration`, and `broadcast` its own limit. Collect the per-row work in a
  named helper and let the caller fan it out. Decide first, write second: `assignStartNumbers`
  validates every entry and queues the writes as closures, then runs them, so a refused draw writes
  nothing. A walk whose next step depends on the previous answer is a recursive function
  (`queryAllSeasons`). Sequential on purpose (the SES send rate in
  `sendTemplatedEmailToEventRegistrations`) runs through `mapWithConcurrency` with a limit of 1: one
  worker, item by item in order, and no `await` inside a loop.
- A module-level cache in a lambda outlives the request: the warm container keeps it for hours. Give
  it a TTL (`secrets.ts`, the staff-address cache in `email.ts`) and forget a failed lookup rather
  than caching the rejection.
- Avoid `as const` on an array whose element types the caller needs to see as non-promise; the
  bare array literal already infers the tuple.

### Sorting

- **`.sort()` always takes a comparator (S2871).** Numbers: `(a, b) => a - b`. Strings: an
  explicit `localeCompare` — use `compareByLocalizedString('name')` from `src/lib/client/sort`
  rather than open-coding `a.name.localeCompare(b.name, i18next.language)`.

### Regular expressions

- `\d` instead of `[0-9]`.
- Bound greedy captures: `/^Bearer\s+(\S+)$/` rather than `(.+)`, to avoid super-linear
  backtracking findings.

### React

- Component props interfaces use `readonly` members.
- A `useMemo` that returns a function is a `useCallback`.
- No `<Fragment>` or `<>` with a single child.

### Types

- `any` or `unknown` in a union swallows every other member — Sonar flags both. Model the value
  instead.
- Do not restate optionality the type already has: if `DogEvent['kcId']` already includes
  `undefined`, the extra `?` is redundant, and `dates?: DogEvent['dates']` should be
  `dates?: NonNullable<DogEvent['dates']>`.

### Tests

Tests are excluded from smell analysis but still scanned, and these come up:

- `await screen.findByText(...)` instead of `waitFor(() => expect(screen.getByText(...)))`.
- `expect(x).toHaveLength(1)` instead of `expect(x.length).toEqual(1)`.
- Always `await expect(promise).rejects...` — a missing `await` is a floating promise.
- No tautologies (`expect(true).toBe(true)`); assert the actual thing.
- Near-identical test cases collapse into `it.each`.

### Sonar is not always right

A finding is a prompt to look, not an order. Two optional-chain suggestions in `updateUser` and
`sameDate` were deliberately left alone because applying them would change behaviour; the
reasoning went into the commit message. Do the same rather than silently breaking something to
clear a rule.

## Lint Gates

- `npm run lint-biome` fails on every Biome warning (`--error-on-warnings`), not only on errors:
  an unused variable, an accumulating spread, a `let` never reassigned or a `biome-ignore` that
  suppresses nothing all stop the commit. Fix the code rather than lowering the rule.
- Explicit `any` is the one warning `lint-biome` skips (`--skip=suspicious/noExplicitAny`), because
  the tree still holds hundreds of them. It is gated by the ratchet below instead, so editors keep
  showing the warning while the count can only go down.

### The assertion ratchet

`npm run ratchet` (`scripts/ratchet.js`) parses every `.ts`/`.tsx` under `src/` and counts three
things AGENTS.md forbids: type assertions (`x as T`, `<T>x`; `as const` does not count) outside
tests, explicit `any` anywhere, and DynamoDB clients opened in non-test code outside their table's
repository (see "Library Organization"; that count is 0, so any new one fails). Each number is
compared with `scripts/ratchet-baseline.json`.

- **How a commit fails.** A count above its baseline fails the ratchet, which runs alongside the
  other pre-commit checks and in both CI lint steps. The message lists the matches in the files
  changed against HEAD, so the new one is easy to find. For an assertion or an `any`, model or
  narrow the value instead; if a boundary conversion is truly unavoidable, remove another assertion
  in the same commit and leave the specific comment LLM_CONTEXT.md asks for. For a DynamoDB client,
  add the access to the table's repository in `src/lambda/lib/repositories/` instead (create
  `<table>Repository.ts` if the table has none yet).
- **How the baseline updates.** A count below its baseline is written back to the file, and the
  pre-commit hook stages the lowered baseline into the same commit. Nobody edits the file by hand.
- **Rebase conflicts.** Two branches that each lowered a number conflict on that line. Take either
  side and run `npm run ratchet`: it writes the real count. A baseline that is merely behind
  (higher than the count) never fails, it just gets lowered on the next run.
- Tests are excluded from the assertion count on purpose: `fn as MockedFunction<typeof fn>` is the
  recommended mock idiom. `any` is counted in tests too.

## Formatting

- Use Biome for formatting files:
  `npm run lint-biome -- --write`

## Commit Messages

- Use Conventional Commits: `<type>(optional-scope): <brief description>`.
- Keep the subject concise and descriptive of the actual change, for example:
  `fix(registrations): broadcast admin note patches`.
- Prefer common types such as `fix`, `feat`, `test`, `refactor`, `docs`, and `chore`.

## Sandbox Notes

- `git commit` requires escalated permissions and does not work in the sandbox.
- Network access is restricted. Dependency installs and commands that fetch remote resources require approval when no matching approval is already active.
