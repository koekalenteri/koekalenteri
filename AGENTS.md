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

- API module mocks live under `src/api/__mocks__/`. If a mocked API export needs `mockResolvedValue` or similar test control, update the global mock there to export a `jest.fn()` instead of working around it with a local spy.
- `src/api/__mocks__/email.ts` exports `sendTemplatedEmail` as a Jest mock function, so tests can use:
  `const mockSendTemplatedEmail = sendTemplatedEmail as jest.MockedFunction<typeof sendTemplatedEmail>`

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
