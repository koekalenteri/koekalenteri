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
