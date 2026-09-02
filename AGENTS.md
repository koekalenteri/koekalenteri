# Agent Notes

Read `LLM_CONTEXT.md` for the project overview and architecture notes.

## Test Gotchas

- For focused frontend Vitest runs, pass the test path and `--run`:
  `npm run test-frontend -- --run <paths...>`
- Focused runs should include `--run` to disable watch mode.
- Frontend typecheck is `npm run lint-frontend`.
- Use `git diff --check` before finishing edits to catch whitespace issues.

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

## Data Migrations

- A one-off data migration is an entry in the `migrations` array of
  `src/lambda/RunMigrationFunction/handler.ts`: a `name` plus an idempotent `run(event)` that
  mutates the item and returns whether it changed. The lambda runs every migration over all event
  rows via `POST /admin/migrate` (admin-only) and reports per-migration counts, so a migration must
  stay safe to re-run on every invocation.
- Do not write a data migration as a repo script or npm command. The KOE-1266 start number backfill
  started as `scripts/backfill-start-numbers-published.mjs` and was moved into the lambda to keep
  the practice uniform.
- When a migration changes data the browser caches, `run` must also bump `updatedAt` — the
  incremental fetch (`changedSince` in `src/lambda/lib/incremental.ts`) reads it, and a row
  rewritten without moving it never reaches clients that already hold the event. `modifiedAt` stays
  untouched: it records a user's edit, which a migration is not.
- `scripts/migrate.sh` and `aws/README.md` cover a different job — copying whole tables between
  stacks — not changing data in place.

## Visual Test Convention

- When you change or create a user-visible component, ensure it has a screenshot test
  (`*.visual.test.tsx` beside the component). If one does not exist, create it in the same change.
- Visual tests run in a real browser with real Finnish translations via `npm run test-charts`
  (the `charts` vitest project picks up `src/**/*.visual.test.tsx` anywhere). Wrap the capture in a
  fixed-width, opaque `data-testid` frame and the app `ThemeProvider`; see
  `src/pages/admin/eventResultsPage/ResultsTable.visual.test.tsx` for the pattern.
- Generate both platform baselines: `npm run test-charts -- <TestName> -u` (darwin) and
  `npm run test-charts-linux -- <TestName> -u` (linux, via Docker). The pre-commit hook refuses a
  commit that updates one platform's baseline without the other.
- Name the relevant KOE issue keys in the commit message: on push, the `jira-screenshots` workflow
  attaches the changed linux baselines to those Jira issues, so the ticket always shows the current
  look of the components it covers.

## Jira Automation

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
