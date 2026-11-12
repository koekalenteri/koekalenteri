---
name: verify-dev
description: Test the Jira issues in Ready for Testing on dev through the UI, with the project's Playwright browser and the dev test accounts. An issue that works moves to Done with its evidence; one that does not goes back to In Progress with expected, observed, repro steps and a screenshot; one that cannot be tested through the UI is skipped with the reason. Runs between the merge and the production release. Use for "testaa devissä", "/verify-dev" or "/verify-dev KOE-1674".
model: opus
---

# /verify-dev [KEY...]

Tests what is merged and deployed to dev (https://dev.koekalenteri.snj.fi) the way a tester would,
before it goes to production. Without keys it takes every issue in Ready for Testing; with keys,
only those. The release decision stays with the user.

- **The browser** is the `playwright` MCP server (`e2e/README.md`, "Claude's browser on dev"). Its
  allowlist keeps it on dev (`e2e/README.md`, "The allowlist"). Never use another browser for
  this, and never touch production, not even to read.
- **No AWS.** Signing in, data and every check go through the dev UI. Jira is used through its
  REST API (comments through the Atlassian MCP tool, step 5), GitHub through `gh`.
- **Test data** (accounts, organizers J1 and J2, events, email addresses, dogs, payments, results
  to Kennelliitto) follows `.claude/skills/verify-dev/test-data.md`. Read it before the first step;
  its rules (nothing is deleted, no Kopioi ympäristöön, the allowlist is not edited mid-run) hold
  on every step.
- **Credentials** of the test accounts are never read: not from `.env`, not with a command,
  not to check them. The browser has them as secrets (`e2e/README.md`, "The credentials"): type
  the variable's name, `E2E_DEV_<KEY>_EMAIL` or `E2E_DEV_<KEY>_PASSWORD`, into the field with
  `browser_type` or `browser_fill_form`, exactly and alone, and the browser fills in the value.
  A value the page shows later comes back as `<secret>E2E_DEV_<KEY>_EMAIL</secret>`. If a value
  shows anyway, keep it out of every reply, Jira comment, screenshot and log line.
- **A browser without the secrets** fills the name in literally: the snapshot shows
  `E2E_DEV_<KEY>_EMAIL` in the field, the action reads `fill('E2E_DEV_...')` instead of
  `fill(process.env['E2E_DEV_...'])`, and the sign-in fails. That is a session started before
  `scripts/playwright-mcp.mjs` was in its checkout, or without the keys in `.env`. Stop the run
  and tell the user to start a new session from the main checkout with main pulled (and to fill in
  `.env` if the server's log says the keys are missing); never work around it by reading `.env`.
- **Network requests** are read only by the part a check needs, never whole and never their
  headers, because the headers carry the signed-in account's id token (`Authorization`, its
  payload holding the account's email), which no secret covers. `browser_network_requests` lists
  each request as its method, address and status, which is enough for a status such as a 403.
  `browser_network_request` is called with `part: "request-body"` or `part: "response-body"`:
  without `part` it returns both the request's and the response's headers with the details, and
  `request-headers` and `response-headers` return the headers alone. A check reads only the
  requests to the dev site and its API, never the body of a sign-in or token request to Cognito
  or STS, because those bodies carry the tokens and what was typed. If a token or another
  secret lands in a tool's output anyway, it goes into no reply, Jira comment, screenshot, file or
  report text, and the run summary says that it happened.
- **Signing in and the admin side.** The pages that check for admin access are `/admin` and
  everything under it (`/admin/event/startlist/<id>` and `/admin/event/startlist-preview/<id>`
  among them) and `/stats` (`src/routeConfig.ts`, `src/pages/components/AdminAccessGuard.tsx`).
  - Sign in at https://dev.koekalenteri.snj.fi/login. Before judging anything, wait until the
    sign-in has finished: the address has left `/login` and the snackbar "Tervetuloa, <name>!" has
    shown, or the header shows the account's menu. Until then the user is still loading and the
    header has no Ylläpito for anyone.
  - Ylläpito shows in the header only to an account with admin access (global admin or any
    organizer role). Enter the admin side by clicking it and move inside it through the side
    menu; type an `/admin/...` address only for a case that needs it, such as an access check.
    The public start list (`/startlist/<id>`) has no access check.
  - On one of those pages, a signed-out visitor is sent to the login page and returned to the page
    after signing in. A signed-in account without admin access sees "Ei käyttöoikeutta" with
    Etusivulle, and the address stays. When the `/user` fetch fails, the page shows "Käyttäjätietojasi
    ei saatu ladattua." with Yritä uudelleen. Any of these is the refused state, not a finding.
  - An organizer account (`SIHTEERI`, `SIHTEERI_2`, `YHDISTYS_ADMIN`) with no Ylläpito after the
    sign-in has finished has no role on the record its sign-in reaches, whatever Käyttäjät shows.
    Its organizer cases cannot run: name the account in the run summary and skip them.
- **Admin-only pages** are the side menu's lower group, shown only to a global admin
  (`isAdminAtom`, `src/pages/components/SideMenu.tsx`). For an organizer account (`SIHTEERI`,
  `YHDISTYS_ADMIN`) the menu hides them, but only Tapahtumat, paikat ja startit has a route guard.
  Typing a page's address as such an account counts as refused when:
  - Tapahtumat, paikat ja startit (`/admin/event-breakdown`): the page sends it on to
    `/admin/event` (`src/pages/admin/EventBreakdownPage.tsx`).
  - Yhdistykset (`/admin/organizations`): the list shows, Päivitä yhdistykset Kennelliiton
    rajapinnasta is hidden (`src/pages/admin/OrganizerListPage.tsx`), and saving in Muokkaa
    yhdistyksen tietoja fails with 403 (`authorizeAdmin`,
    `src/lambda/PutOrganizerFunction/handler.ts`).
  - Tapahtumatyypit (`/admin/types`): the list shows, Lisää uusi tapahtumatyyppi is disabled and
    Päivitä tapahtumatyypit Kennelliiton rajapinnasta hidden
    (`src/pages/admin/EventTypeListPage.tsx`); a save fails with 403
    (`src/lambda/PutEventTypeFunction/handler.ts`).
  - Viestipohjat (`/admin/templates`): the templates show, and saving one fails with 403
    (`src/lambda/PutEmailTemplateFunction/handler.ts`).

  Read the 403 from `browser_network_requests`, and check that the change did not stick after a
  reload. Reading these lists is allowed for an organizer account today
  (`GetOrganizersFunction`, `GetEventTypesFunction`, `GetEmailTemplatesFunction`), so a visible
  list alone is no finding.
- **Jira:** REST at https://koekalenteri.atlassian.net with `JIRA_USER_EMAIL` and
  `JIRA_API_TOKEN` from `.env` (the main checkout's from a worktree), loaded inside the command
  that calls Jira, as `candidates.mjs` does, and never printed. Status names are exact: "Ready
  for Testing", "Testing In Progress", "In Progress", "Done"; a misspelled one silently matches
  nothing.

## 0. Setup check

Runs first on every run. When everything is in place, it costs one sign-in and opens no dialog.

1. Sign in as `PAAKAYTTAJA` at the login page, typing `E2E_DEV_PAAKAYTTAJA_EMAIL` and
   `E2E_DEV_PAAKAYTTAJA_PASSWORD` into its fields ("Signing in and the admin side" above). Wait
   until the sign-in has finished (the address has left `/login` and "Tervetuloa, <name>!" has
   shown, or the header shows the account's menu); judging earlier stops the run for nothing. If
   the header then has no Ylläpito, the account has no access at all: stop the run and tell the
   user to make it a global admin by hand (Käyttäjät, Muokkaa rooleja, Koekalenterin
   pääkäyttäjä). If it is there, click it: the side menu shows Yhdistykset only to a global
   admin. Without Yhdistykset, stop the run the same way. Only an existing admin can grant the
   role, and nothing below works without it.
2. Open Käyttäjät from the side menu, Yhdistys set to Kaikki. Find each of the other four accounts
   by typing its `E2E_DEV_<KEY>_EMAIL` into the search field; the browser types the address. A
   user appears on the page only after its first sign-in, so for each account whose row is
   missing: close the browser (`browser_close`), sign in once as that account, then sign in as
   `PAAKAYTTAJA` again and come back. The other accounts sign in at the login page too, and none
   of them opens the admin side here.
3. Compare each account's roles with the expected roles in `test-data.md`, "Accounts". The Roolit
   column's tooltip lists them: Koekalenterin pääkäyttäjä (global admin), then one line per
   organizer role, "Yhdistyksen pääkäyttäjä - <organizer>" (admin) or "Koesihteeri - <organizer>"
   (secretary). An account with no role has no tooltip at all. Lines for a judge or an official
   come from Kennelliitto and are not roles; leave them out of the comparison.
4. The skill changes an account's roles only when the sign-in check finds that they are not what
   `test-data.md` expects. If every account already has the expected roles, no role dialog is
   opened and nothing is changed. When something is wrong, fix only that account's mismatch (add
   what is missing, remove what is extra), and list every change in the run summary.
   - Select the row and press Muokkaa rooleja. The dialog saves each control at once; there is no
     save button.
   - While Koekalenterin pääkäyttäjä is ticked, the dialog shows only a note that a global admin
     has every organizer's rights. For an account that must not be a global admin, untick it
     first; the organizer roles and the row to add one appear after that.
   - An organizer role is removed with Poista on its row and added in the last row: the organizer
     by its full name, Rooli, Lisää. Close with Sulje and read the tooltip again.
   - This is the only place the skill opens a role dialog.
5. Take no screenshot of Käyttäjät: it shows the accounts' emails.

## 1. Candidates

```
.claude/skills/verify-dev/candidates.mjs [KEY...]
```

The first line names the newest main CI run whose `deploy-dev / smoke` job succeeded, with its
commit and the state of `deploy-dev / e2e`. Then one line per issue: key, status, onDev, the
newest commit on main that claims the key, its PRs, the folders the claiming commits changed, and
the summary.

- **onDev `yes`:** the newest claiming commit is in the deployed commit's history. Smoke is the
  last step of the deploy itself, so the code is out even when e2e failed after it; name a failed
  e2e in the summary.
- **onDev `no`:** the change is merged but not deployed yet (CI still running, or the deploy
  failed). **`no commit`:** nothing on main claims the key. **`no deploy`:** no successful deploy
  among the last 30 runs. Each of these is skipped: no move, no comment, the reason in the summary.
- An issue given by key is tested from Ready for Testing or Testing In Progress. In any other
  status it is skipped with the status as the reason.

Test the issues one at a time, in the order listed.

## 2. Read and decide

- Read the issue with its comments and attachments
  (`/rest/api/3/issue/<KEY>?expand=renderedFields`): the acceptance criteria, and the comment
  where the implementer says what was wrong, what changed and what to try. The CI's "Puskettu
  deviin" comments only list commits. If the issue is a sub-task, read its story's criteria too.
- Read the PR's diff (`gh pr diff <n>`) to see which views, roles and edges the change reaches.
- An issue that cannot be tested on dev through the UI is skipped: no move, no comment, the reason
  in the summary. That covers:
  - nightly or scheduled jobs, migrations, logs, anything only AWS shows;
  - changes with no app code (the areas column holds no folder under `src`, `public`, `docs` or
    `template`): CI, config, Claude tooling;
  - managing users' rights, which would need a test account's roles changed;
  - anything that needs production.
  A part of an issue that cannot be tested this way is named in the comment as not tested; it
  does not skip the rest.

## 3. Start

- Move the issue to Testing In Progress, unless it is already there. Take the transition id by
  its target's name from `GET /rest/api/3/issue/<KEY>/transitions`, then `POST` it to the same
  endpoint.
- Make or find the data as `test-data.md` says: a rerun of the same issue reuses the event named
  with its key.

## 4. Test

- Write down the cases first, from the criteria and the implementer's guidance: every path it
  names, their edges (an empty value, a limit, a second day or class), and at least one account
  that must not succeed. A secretary's action is also tried as `ILMOITTAJA` and as `SIHTEERI_2`
  for a J1 event; an admin-only page as `SIHTEERI`; a registrant's own page as another registrant
  or signed out.
- Sign in at the login page with the account the case needs, typing its
  `E2E_DEV_<KEY>_EMAIL` and `E2E_DEV_<KEY>_PASSWORD`, and reach admin pages only as "Signing in
  and the admin side" says. An account with no access at all (`ILMOITTAJA`) passes an admin-page
  case when its header has no Ylläpito and the page's address, typed, shows "Ei käyttöoikeutta".
  An organizer
  account is tried on an admin-only page by typing its address and judged by "Admin-only pages"
  above. To switch account, close the browser (`browser_close`) and sign in again; the profile
  keeps nothing between them.
- Take a screenshot of every point you judge (`browser_take_screenshot`) with an explicit
  `filename` under `.playwright-mcp/<KEY>/`, named after what it shows, e.g.
  `.playwright-mcp/KOE-1674/sihteeri-tallennus-onnistui.png`. The browser writes only inside the
  repository: a name is resolved against the repository root, so a bare `x.png` lands in the root,
  and a path to the scratchpad is refused. `.playwright-mcp/` is git-ignored, and the server's own
  output (snapshots, console logs) lands there too.
- Read what the page shows, not what you expect it to show. When unsure whether something is a
  defect or works as designed, find out from the code (`git show origin/main:<path>`) before
  deciding, and say which in the comment.
- When the run cannot go on for a reason outside the change (an origin missing from the
  allowlist, a payment page that does not load, Kennelliitto's test environment refusing the
  trial), the issue is blocked: step 5.

## 5. Verdict

Every comment is in Finnish, the app's own terms from `translation.json`, with every issue key,
commit and file as a Markdown link (`AGENTS.md`, "Every reference in a Jira comment is a link").
Attach the screenshots from `.playwright-mcp/<KEY>/` first
(`POST /rest/api/3/issue/<KEY>/attachments`, header `X-Atlassian-Token: no-check`, the file as
the multipart field `file`) and name them in the comment. Post the comment with the Atlassian MCP
tool `addCommentToJiraIssue` (`cloudId` `koekalenteri.atlassian.net`, `contentFormat:
"markdown"`): the REST endpoint `POST /rest/api/3/issue/<KEY>/comment` takes only ADF and answers
a Markdown body with 400 "Comment body is not valid!". Move the issue only after the comment is
in.

- **Works:** a comment with what was tried, with which accounts, and the screenshots as evidence;
  then move it to Done.
- **Does not work:** a comment with **Odotettu** (what the criteria or guidance say), **Havaittu**
  (what the page did), **Toistoaskeleet** (from signing in, with the account by its key, never its
  email) and the screenshot; then move it to In Progress. `/ticket` or `/comments` picks it up from
  there.
- **Blocked:** a comment naming the blocker and what was tested before it; then move it back to
  Ready for Testing, so the next run takes it again.

## 6. Run summary

To the user, one list each, with links:

- **Done**, **returned to In Progress** (the finding in one line), **blocked** (the blocker) and
  **skipped** (the reason).
- Every role change the setup check made, per account. "No changes" when there were none.
- The deploy tested against, and its e2e state when it was not success.
- A token or another secret that landed in a tool's output, with the tool and the step, never
  the value. Nothing when none did.

Before the summary, `git status --short` shows nothing new. A file the browser wrote outside
`.playwright-mcp/` (a screenshot saved without the folder in its name) is moved under
`.playwright-mcp/<KEY>/`, never committed.
