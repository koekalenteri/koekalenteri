# Browser tests

Playwright drives the production frontend build against the real lambda bundles and a local
DynamoDB (KOE-396). Nothing is mocked inside the application: what differs from the deployed
stack is only what surrounds it.

| Piece                 | Port | What it is                                                                                            |
| --------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| `server/frontend.mjs` | 3000 | serves `build-e2e/`, falling back to `index.html` like Amplify                                        |
| `server/api.mjs`      | 8080 | API Gateway's part: routes from `dist/template.yaml`, calls `dist/lambda/<Fn>/handler.mjs` in-process |
| `fakes/server.mjs`    | 9000 | SES, SSM and Paytrail, reached through `AWS_ENDPOINT_URL_*` and `PAYTRAIL_API_ENDPOINT`               |
| DynamoDB-local        | 8000 | tables from `scripts/init-tables.mjs`, i.e. from `template/tables`                                    |

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
`DYNAMODB_ENDPOINT` pointing at a service container. The frontend build comes from the frontend
job, which builds `build-e2e` for this; only when that job was skipped do the tests build it
themselves. It splits the tests into two `--shard`s of one worker each.

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

## Against dev after a deploy

`playwright.remote.config.ts` runs the tests in `remote/tests/` against a deployed stack: the
release workflow's `e2e` job, after every deploy of dev (each push to main, a backend-only one
too) and its smoke check (KOE-1559). A red run fails `deploy-dev`, so `jira-testable` does not
run, as with a red smoke check. The front page must list an event, its
registration form must open from the list, and the form's validation must list what is missing
and take the terms off the list once they are accepted. Without a dog that is all the form offers:
the breeder's and owners' sections open once there is a dog, and the dog is not fetched (that goes
to the Kennel Club). No login or payment is needed and the form is never sent, so nothing is
stored and no mail goes out.

Dev holds no event the run can count on, so the run writes its own. `remote/global-setup.ts`
builds it with `buildEvent` (`fixtures/events.ts`, the same row the local tests write) and stores it in
the stack's event table under the organizer id `e2e-remote`, which no real organizer has. Every event
of that organizer is deleted before the tests, after them and once more by the workflow whatever
the outcome (`remote/sweep.mjs`), found by an exact query on `gsiOrganizerStartDate`. That index
trails the write by a moment, so the run's own event is also kept by id in
`test-results/e2e-remote-event.json` before it is written and deleted by key. The public
list reads the event through an index DynamoDB updates a moment after the write, and the front page
asks for the list once, so the tests start only when `GET <E2E_API_URL>/event` lists the event (at
most 30 s), which also warms the function the deploy has just replaced.

```sh
E2E_BASE_URL=https://<frontend>/ E2E_API_URL=<the stack's KoekalenteriFunctionApi> \
  E2E_EVENT_TABLE=<the stack's EventTable> npm run test-e2e-remote
```

AWS credentials and the region come from the environment. Pointed at the local servers above, the
same run checks a local build: `E2E_BASE_URL=http://localhost:3000`,
`E2E_API_URL=http://localhost:8080/dev`, `E2E_EVENT_TABLE=event-table`,
`AWS_ENDPOINT_URL_DYNAMODB` at the DynamoDB-local and `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
set to `local`, the key the servers' database is kept under.

## Claude's browser on dev

`.mcp.json` gives Claude Code sessions in this repository a browser of their own: the Playwright
MCP server (`@playwright/mcp`, pinned in `package.json`), named `playwright`, run from
`node_modules` by `scripts/playwright-mcp.mjs` with the settings in `.claude/playwright-mcp.json`
(KOE-1731). It is for checking
a change on dev (https://dev.koekalenteri.snj.fi) the way a tester would, signed in through the
dev login form. Claude Code asks once, at the first session after the file appears, whether to
approve the project server; `claude mcp get playwright` shows whether it is approved. The server
runs from `node_modules`, so a fresh checkout or worktree needs `npm ci` first, or Claude Code
shows the server as failed.

- The browser is headless and isolated: its profile lives in memory and nothing is kept between
  sessions. To change account, close the browser (`browser_close`) and sign in again through
  the form.
- It uses Playwright's Chromium when that is installed for the server's Playwright version, and
  Google Chrome otherwise.
- Snapshots and console logs land in `.playwright-mcp/` at the repository root, which git ignores.

The test accounts are in `.env` as `E2E_DEV_<KEY>_EMAIL` and `E2E_DEV_<KEY>_PASSWORD`
(`.env.sample` lists the names), each meant for one role on dev. A worktree without a `.env` of
its own uses the main checkout's, the first entry of `git worktree list`.

| KEY              | Role                        |
| ---------------- | --------------------------- |
| `PAAKAYTTAJA`    | global admin                |
| `YHDISTYS_ADMIN` | admin of the organizer J1   |
| `SIHTEERI`       | secretary of J1             |
| `SIHTEERI_2`     | secretary of J2             |
| `ILMOITTAJA`     | no role, a plain registrant |

`/verify-dev` checks these roles at the start of every run (`.claude/skills/verify-dev/SKILL.md`, step 0).

### The credentials

A session never reads the credentials, because whatever it reads lands in its transcript. The
browser holds them instead: `scripts/playwright-mcp.mjs` hands the `E2E_DEV_*` keys of that `.env`
to the server as its secrets (`--secrets`), and the session types a key's name where the value
goes. `browser_type` and `browser_fill_form` fill in
the value when the text is exactly the name of a secret, the tool response shows the action as
`process.env['E2E_DEV_SIHTEERI_PASSWORD']`, and a value that shows up in a later response, an
email in the user list say, is replaced with `<secret>E2E_DEV_SIHTEERI_EMAIL</secret>`.

- Only the `E2E_DEV_*` keys are handed over, not the whole `.env`. The server would replace every
  other value too wherever it appears (`REACT_APP_REGION=eu-north-1` from `.env.sample` in every
  Cognito URL), and fill `JIRA_API_TOKEN` into a dev form field as readily as a password when its name is typed.
- The server takes secrets only as a dotenv file. The launcher writes it under `.playwright-mcp/`
  and removes it as soon as the server has read it, before the server answers its first request.
- Upstream calls this a convenience, not a security feature: it keeps the values out of the tool
  responses, and nothing stops a page from showing them some other way, in a screenshot for one.
- The server gets its secrets once, when the session starts it. A session started before this
  launcher was in its checkout, or while there was no `.env` or no `E2E_DEV_*` keys in it,
  has a browser without secrets: a typed name lands in the field literally (the snapshot
  shows `E2E_DEV_SIHTEERI_EMAIL` in the field, and the action as `fill('E2E_DEV_SIHTEERI_EMAIL')`
  rather than `process.env[...]`) and the sign-in fails. The launcher names the cause on its
  standard error. Fill in `.env` if that is what is missing, and start a new session from the
  main checkout with main pulled.

### The allowlist

The browser may request only the origins listed under `network.allowedOrigins`; every other
request, a page load included, is aborted with `net::ERR_BLOCKED_BY_CLIENT`. The list holds what
loading dev, signing in and opening the admin page request (the front end, the dev API, Cognito,
STS and CloudWatch RUM) and Paytrail's payment page. When a run needs another origin (a bank's
test page behind Paytrail, say), the blocked request shows in `browser_network_requests` as
`ERR_BLOCKED_BY_CLIENT`: add that origin, a scheme and a host with no path, port or wildcard, to
the list in the same change that needs it.

- The two `execute-api` hosts are the dev stack's: `h1tkq96ib3` its API, `b98joqlym3` its
  WebSocket. A recreated stack gets new ones; take them from the stack's outputs, or from
  `REACT_APP_API_BASE_URL` and `REACT_APP_WS_API_URL` of the dev Amplify app, which
  `template/amplify.yaml` builds from the stack. Its CSP `connect-src` allows any `execute-api`
  host of the region and does not name them.
- The filter is Playwright's request routing, which does not route WebSockets: the `wss://` entry
  records what the page opens and enforces nothing.
- Nor does it see the hops of an HTTP redirect, so it keeps the browser off production by default
  and is not a security boundary.

Production (https://koekalenteri.snj.fi and its API) is not on the list, so the browser cannot
open it, a navigation from a dev page included. `scripts/playwright-mcp-config.test.mjs` refuses
an entry that is not a bare origin, and any host under `koekalenteri.snj.fi` other than
`dev.koekalenteri.snj.fi`, which keeps out the production front end and the auth domains. The
production API's `execute-api` host cannot be told from dev's by its name, so keeping it off the
list is up to review.
