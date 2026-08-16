# Agent Notes

Read `LLM_CONTEXT.md` for the project overview and architecture notes.

## Test Gotchas

- For focused frontend Jest runs, set `CI=1` to disable watch mode and colorized output:
  `CI=1 npm run test-frontend -- --runTestsByPath <paths...>`
- Avoid running focused tests as only `npm run test-frontend -- --runTestsByPath <paths...>`. In this environment it can report results and then leave a lingering Jest process.
- If a Jest process gets stuck, the sandbox may block `ps` and `pkill`, so prefer the non-watch command above from the start.
- Frontend typecheck is `npm run lint-frontend`.
- Use `git diff --check` before finishing edits to catch whitespace issues.

## Mocking Gotchas

- Mock only boundaries whose behavior the test must control or observe, such as network calls, AWS services, persistence, authorization, secrets, clocks, randomness, or side-effect publishers.
- Do not mock deterministic local functions merely to simplify a test or its expected value. Formatting, parsing, mapping, and other pure domain helpers should run as production code; assert their real output instead. Examples include `formatMoney`, `getProviderName`, HMAC calculation, and Paytrail error parsing.
- At handler boundaries, mocking an already-tested shared workflow is acceptable when the handler test is specifically about delegation. Test the real workflow in its owning `src/lambda/lib/*.test.ts` suite.
- When an ESM module mock must provide an unrelated named export only because Jest replaces the whole module, keep that export minimal and do not use the stub as evidence that the real behavior works. Prefer real implementations or a narrower boundary when practical.
- API module mocks live under `src/api/__mocks__/`. If a mocked API export needs `mockResolvedValue` or similar test control, update the global mock there to export a `jest.fn()` instead of working around it with a local spy.
- `src/api/__mocks__/email.ts` exports `sendTemplatedEmail` as a Jest mock function, so tests can use:
  `const mockSendTemplatedEmail = sendTemplatedEmail as jest.MockedFunction<typeof sendTemplatedEmail>`

## Library Organization

- Before adding a file under `src/lib/` or `src/lambda/lib/`, look for an existing module that owns the same domain and extend it when the responsibility remains cohesive.
- Avoid narrowly named parallel helper files for variants of one workflow, such as `paymentCreation.ts` and `paymentCancellation.ts`, when the code belongs naturally in `payment.ts`.
- Create a new library file only when it represents a clearly separate, reusable responsibility or a meaningful dependency boundary. Name it after the domain concept rather than a one-off operation or implementation detail.

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
