# Test data on dev

How `/verify-dev` makes and finds the data it tests with on https://dev.koekalenteri.snj.fi.
Everything goes through the dev UI in the project's Playwright browser (`e2e/README.md`, "Claude's
browser on dev"). The skill has no AWS access: it never reads or writes DynamoDB, never calls the
API by hand, and changes what a test account may do only in its setup check (below).

## Accounts

The test accounts, their keys, and how to switch between them are in `e2e/README.md`,
"Claude's browser on dev". Their credentials are in the `.env` of the main checkout (the first
entry of `git worktree list`), not a worktree's. Read them from there and never print them: not in
a reply, a Jira comment, a screenshot or a log line.

| KEY              | Roles, and nothing else    | Used for                                    |
| ---------------- | -------------------------- | ------------------------------------------- |
| `PAAKAYTTAJA`    | global admin               | Admin-only pages, looking across organizers |
| `YHDISTYS_ADMIN` | admin of J1                | Organizer admin views of J1                 |
| `SIHTEERI`       | secretary of J1            | Creating and running test events            |
| `SIHTEERI_2`     | secretary of J2            | Checking that J1's data stays out of sight  |
| `ILMOITTAJA`     | none                       | Registering, the registrant's own pages     |

- The roles are given on dev's Käyttäjät page (`/admin/users`), and `PAAKAYTTAJA` must be a
  global admin for that; only an existing admin can make it one, so that is the user's to do.
- The skill changes an account's roles only when the sign-in check finds that they are not what
  this file expects. If every account already has the expected roles, no role dialog is opened and
  nothing is changed. When something is wrong, fix only that account's mismatch (add what is
  missing, remove what is extra), and list every change in the run summary. The check is step 0
  of `SKILL.md`; no other step opens a role dialog.
- Do not open `/admin` as `ILMOITTAJA` until KOE-1734 is fixed: a user with no role loops there and
  hangs the browser.

## Organizers

| Name            | Code | Why                                                                 |
| --------------- | ---- | ------------------------------------------------------------------- |
| ACTION DOGS RY  | J1   | Owns every test event                                               |
| ACTION RY       | J2   | Its secretary checks that an organizer role does not see J1's data  |

Pick the organizer by its full name in the event form's
Järjestäjä field: the two names differ by one word.

## Events

- Create events as `SIHTEERI`, for J1 (Tapahtumat, Uusi tapahtuma). Registrations go through the
  public form, signed out or as `ILMOITTAJA`.
- The event name holds `E2E` and the issue key, e.g. `E2E KOE-1234 NOME-B`. Before creating one,
  search the admin event list for the key, with Näytä myös valmiit tapahtumat on: a rerun of the
  same issue reuses the event it made before, so the history of every run stays on one event.
- Nothing is ever deleted: no Poista on an event, a registration or anything else. Test events stay
  on dev as a base for manual testing.
- Never use Kopioi ympäristöön: it writes into another environment.

## Email

Outside prod, `deliverableRecipients` in `src/lambda/lib/email.ts` sends only to the
environment's staff (a user with admin rights or any role, at their own address or a
plus-address of it) and to `@simulator.amazonses.com`. Everyone else is dropped, and the
registration's Muutoshistoria shows "Viesti estetty testiympäristössä".

- Type `success+<issue key>@simulator.amazonses.com` into every email field of a form (owner,
  handler, payer), with the key in lower case: `success+koe-1234@simulator.amazonses.com`. SES
  accepts it and no person reads it.
- Never type a test account's own address into a form. They are plus-addresses of a real mailbox
  whose owner is staff on dev, so mail to them reaches a person.
- `bounce@simulator.amazonses.com` only in an issue about bounces, and always with a tag of its
  own: `bounce+koe-1234@simulator.amazonses.com`. A bounce puts the address on the suppression
  list (`SesNotificationFunction` `suppressAddress`), and from then on every registration save,
  public or admin, that adds that exact address is refused with "Sähköpostiosoitetta ... ei voi
  käyttää ilmoittautumiseen" (`assertRegistrationEmailsNotSuppressed` in
  `src/lambda/lib/emailSuppression.ts`). The address is only trimmed and lower-cased, plus tag kept,
  so the tag is what keeps one bounce from blocking the others. Nothing removes a suppression, so a
  rerun of the same bounce issue needs a new tag: `bounce+koe-1234-2@...`.
- `success+...` never bounces and can be reused on every run.

## Dogs

- Fetching a dog from Kennelliitto on dev is allowed (Hae koiran tiedot on the registration form).
- Prefer dogs dev registrations already use: their data is known to fetch, and they add no new
  dogs to dev. To find one, sign in as `PAAKAYTTAJA`, open the admin event list with Näytä myös
  valmiit tapahtumat on, open a few events' Ilmoittautumiset and take a registration number that
  appears in several of them.

## Payments

Dev uses Paytrail's test environment. Pay with the test bank Nordea, and on its page choose
"palauta hyväksytty maksu" for a paid registration or "palauta hylätty maksu" for a failed one.
When the bank page does not load, its origin is missing from the browser's allowlist
(`e2e/README.md`, "The allowlist"), which takes a new origin in the change that needs it. The run
stops there: report the missing origin as a blocker for a PR, and never edit
`.claude/playwright-mcp.json` mid-run or pay some other way.

## Results to Kennelliitto

Dev sends results to Kennelliitto's test environment, not to the real Omakoira, so sending from
a test event is allowed. The app does not show which environment it talks to; judge a send by what
the app shows:

- the send dialog, Tulosten lähetys Omakoiraan, opened from the event's Lähetä Omakoiraan, with its
  per-dog state and the toast "Tulokset on tallennettu Omakoiraan N koiralle" or the failure text,
- the Omakoira column of the results table (Lähetetty, Ei lähetetty, Muuttunut, Virhe),
- the registration's Muutoshistoria ("Lähetti tuloksen Omakoiraan").

A send needs the event linked to a trial in Kennelliitto's test environment. When the dialog says
it cannot send (for example "Koetta ei löytynyt Kennelliitosta"), that is the observed state to
report, not something to work around.
