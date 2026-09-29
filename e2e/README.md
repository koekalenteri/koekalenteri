# Browser tests

Playwright drives the production frontend build against the real lambda bundles and a local
DynamoDB (KOE-396). Nothing is mocked inside the application: what differs from the deployed
stack is only what surrounds it.

| Piece | Port | What it is |
| --- | --- | --- |
| `server/frontend.mjs` | 3000 | serves `build-e2e/`, falling back to `index.html` like Amplify |
| `server/api.mjs` | 8080 | API Gateway's part: routes from `dist/template.yaml`, calls `dist/lambda/<Fn>/handler.mjs` in-process |
| `fakes/server.mjs` | 9000 | SES, SSM and Paytrail, reached through `AWS_ENDPOINT_URL_*` and `PAYTRAIL_API_ENDPOINT` |
| DynamoDB-local | 8000 | tables from `scripts/init-tables.mjs`, i.e. from `template/tables` |

All of it is configured in `env.mjs`. Playwright's `webServer` starts the three servers and
stops them after the run; `global-setup.ts` checks the builds and creates the tables.

The API server does what API Gateway does before a lambda runs: strips the `/dev` stage, answers
CORS preflight, and for a route with the Cognito authorizer turns the Bearer token's payload into
`requestContext.authorizer.claims`. The token's signature is not checked. The fake bank at
`/paytrail/bank/<transactionId>` has buttons for a paid, a cancelled and a forged return; the
messages SES was asked to send are at `GET http://127.0.0.1:9000/_sent`.

## Running locally

```sh
npm run test-e2e-local                                   # build, then run every test
npm run test-e2e-local -- e2e/tests/groups.spec.ts --headed
npm run test-e2e-local -- --no-build --ui                # skip the builds, Playwright's UI
```

`run-local.mjs` refuses to start while something listens on 3000, 8080 or 9000: outside CI
Playwright would reuse that server, and `npm start` there would put the tests against the dev
stack. It starts an in-memory DynamoDB-local of its own (`koekalenteri-e2e-dynamodb`, port 8001)
and leaves it running for the next run; `docker stop koekalenteri-e2e-dynamodb` empties it. The
tests run the builds, not the sources, so `--no-build` is only for a run where nothing changed.
Arguments other than `--no-build` go to `playwright test`.

CI runs the same steps one by one: `build-backend`, `build-e2e-frontend` and `test-e2e` with
`DYNAMODB_ENDPOINT` pointing at a service container.

Each test writes its own rows under unique ids (`fixtures/db.ts`) and never empties a table.
Dates are relative to today (`fixtures/dates.ts`), because the lambdas run on the real clock.

## What the tests cover

[TESTS.md](TESTS.md) lists every test with its tags and issues. It is generated from the tests
(`npm run e2e-catalog`), and `lint-e2e` fails in CI and in the pre-commit hook when it no longer
matches them, so a test cannot be added or renamed without the list following. Give a test its
story and any bug it works around or expects in its details, not in its body, where `--list`
cannot see it:

```ts
test('what the test claims', { annotation: issue('KOE-1476'), tag: '@public' }, async ({ page }) => {})
test.fail('is told when …', { annotation: issue('KOE-1482', 'what is wrong') }, async ({ page }) => {})
```

## A run in CI

The job summary on the run's page lists every test with its result and issues, and for each
failed test its error, the failing line and the page's accessibility tree at that moment
(`summary.mjs`). A known bug whose test starts passing shows as such, to remove its `test.fail`.
For the step-by-step trace, download the `e2e-report` artifact and drop a `trace.zip` from it on
[trace.playwright.dev](https://trace.playwright.dev): it runs in the browser, installs nothing and
uploads nothing.
