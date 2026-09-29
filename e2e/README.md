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
docker run --rm -d -p 8000:8000 amazon/dynamodb-local -jar DynamoDBLocal.jar -inMemory -sharedDb
npm run build-backend
npm run build-e2e-frontend
npm run test-e2e
```

Rebuild after changing code: the tests run the builds, not the sources. To use a DynamoDB on
another port, set `DYNAMODB_ENDPOINT`. A server already listening on 3000, 8080 or 9000 is
reused outside CI, so stop `npm start` first.

Each test writes its own rows under unique ids (`fixtures/db.ts`) and never empties a table.
Dates are relative to today (`fixtures/dates.ts`), because the lambdas run on the real clock.

## When a test fails in CI

The job summary on the run's page lists each failed test with its error, the failing line and the
page's accessibility tree at that moment (`failure-summary.mjs`). For the step-by-step trace,
download the `e2e-report` artifact and drop a `trace.zip` from it on
[trace.playwright.dev](https://trace.playwright.dev): it runs in the browser, installs nothing and
uploads nothing.
