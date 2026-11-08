---
name: verify-dev
description: Test the Jira issues in Ready for Testing on dev through the UI, with the project's Playwright browser and the dev test accounts. An issue that works moves to Done with its evidence; one that does not goes back to In Progress with expected, observed, repro steps and a screenshot; one that cannot be tested through the UI is skipped with the reason. Runs between the merge and the production release. Use for "testaa devissä", "/verify-dev" or "/verify-dev KOE-1674".
---

# /verify-dev [KEY...]

Tests what is merged and deployed to dev (https://dev.koekalenteri.snj.fi) the way a tester would,
before it goes to production. Without keys it takes every issue in Ready for Testing; with keys,
only those. The release decision stays with the user.

- **The browser** is the `playwright` MCP server (`e2e/README.md`, "Claude's browser on dev"). Its
  allowlist keeps it on dev (`e2e/README.md`, "The allowlist"). Never use another browser for
  this, and never touch production, not even to read.
- **No AWS.** Signing in, data and every check go through the dev UI. Jira is used through its
  REST API, GitHub through `gh`.
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
- **Jira:** REST at https://koekalenteri.atlassian.net with `JIRA_USER_EMAIL` and
  `JIRA_API_TOKEN` from `.env` (the main checkout's from a worktree), loaded inside the command
  that calls Jira, as `candidates.mjs` does, and never printed. Status names are exact: "Ready for Testing", "Testing In
  Progress", "In Progress", "Done"; a misspelled one silently matches nothing.

## 0. Setup check

Runs first on every run. When everything is in place, it costs one sign-in and opens no dialog.

1. Sign in as `PAAKAYTTAJA` through the dev login form, typing `E2E_DEV_PAAKAYTTAJA_EMAIL` and
   `E2E_DEV_PAAKAYTTAJA_PASSWORD` into its fields. The side menu shows Yhdistykset only to a
   global admin. Without it, stop the run and tell the user to make the account a global admin by
   hand (Käyttäjät, Muokkaa rooleja, Koekalenterin pääkäyttäjä): only an existing admin can, and
   nothing below works without it.
2. Open Käyttäjät (`/admin/users`), Yhdistys set to Kaikki. Find each of the other four accounts
   by typing its `E2E_DEV_<KEY>_EMAIL` into the search field; the browser types the address. A user appears on the page only after its first
   sign-in, so for each account whose row is missing: close the browser (`browser_close`), sign in
   once as that account, then sign in as `PAAKAYTTAJA` again and come back. After signing in as
   `ILMOITTAJA`, do not open `/admin` (KOE-1734, `test-data.md`).
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

- Move the issue to Testing In Progress, unless it is already there. Take the transition id by its target's name from
  `GET /rest/api/3/issue/<KEY>/transitions`, then `POST` it to the same endpoint.
- Make or find the data as `test-data.md` says: a rerun of the same issue reuses the event named
  with its key.

## 4. Test

- Write down the cases first, from the criteria and the implementer's guidance: every path it
  names, their edges (an empty value, a limit, a second day or class), and at least one account
  that must not succeed. A secretary's action is also tried as `ILMOITTAJA` and as `SIHTEERI_2`
  for a J1 event; an admin-only page as `SIHTEERI`; a registrant's own page as another registrant
  or signed out.
- Sign in through the dev login form with the account the case needs, typing its
  `E2E_DEV_<KEY>_EMAIL` and `E2E_DEV_<KEY>_PASSWORD`. To switch account, close the
  browser (`browser_close`) and sign in again; the profile keeps nothing between them.
- Take a screenshot of every point you judge (`browser_take_screenshot`), saved under the
  scratchpad in a folder named after the key. Name each file after what it shows.
- Read what the page shows, not what you expect it to show. When unsure whether something is a
  defect or works as designed, find out from the code (`git show origin/main:<path>`) before
  deciding, and say which in the comment.
- When the run cannot go on for a reason outside the change (an origin missing from the
  allowlist, a payment page that does not load, Kennelliitto's test environment refusing the
  trial), the issue is blocked: step 5.

## 5. Verdict

Every comment is in Finnish, the app's own terms from `translation.json`, with every issue key,
commit and file as a Markdown link (`AGENTS.md`, "Every reference in a Jira comment is a link").
Post with `contentFormat: "markdown"`. Attach the screenshots first
(`POST /rest/api/3/issue/<KEY>/attachments`, header `X-Atlassian-Token: no-check`, the file as
the multipart field `file`) and name them in the comment.

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
