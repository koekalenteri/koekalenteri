# Repositories

The target is that every DynamoDB table the lambdas use is read and written through one module
here: a handler or a `lambda/lib` module that needs a table calls the table's repository and does
not open a `CustomDynamoClient` of its own. Most tables are not here yet; the
`dynamoClientsOutsideRepositories` count in `scripts/ratchet-baseline.json` is the remaining work,
and the table below lists what has moved. New table access goes into a repository from the start.
The epic is [KOE-1405](https://koekalenteri.atlassian.net/browse/KOE-1405).

## Convention

- One module per table, named `<table>Repository.ts` (`dogRepository.ts`), so it does not share a
  name with the domain modules in `src/lib` and `src/lambda/lib`.
- The module opens its client once, at module level:
  `const dynamoDB = new CustomDynamoClient(CONFIG.<table>Table)`. No class, no dependency injection.
- Functions are named by purpose, not by the DynamoDB operation: `readOfficialResults`, not
  `getItem`.
- Keys, index names and projections are written only here. A caller passes domain values (`regNo`,
  `eventId`), never a `{ pk, sk }` object or an index name.
- A transaction over several tables is a function of the repository whose table is the primary one,
  and it uses `documentTransaction`.
- `src/lambda/lib/ws/connectionRepository.ts` follows the same convention and stays in the ws
  domain.

## Testing

- The repository's own test mocks `CustomDynamoClient` with `vi.doMock`, as
  `src/lambda/lib/ws/connectionRepository.test.ts` and `dogRepository.test.ts` do, and checks the
  keys it passes and the results it returns.
- A handler or lib test mocks the repository module, not the client.
- The rules in `AGENTS.md` and `LLM_CONTEXT.md` hold: no `mock.calls`, no type assertions.

## Gate

`npm run ratchet` counts `new CustomDynamoClient(` in non-test files outside this directory and
`connectionRepository.ts` (`dynamoClientsOutsideRepositories` in `scripts/ratchet-baseline.json`).
The count can only go down; moving a table here lowers it.

## Repositories

| Table | Module | Used by |
| --- | --- | --- |
| dataVersion | `dataVersionRepository.ts` | `lib/dataVersions.ts` (the version registry and the applied migrations), `RepairDataVersionsFunction` (its types) |
| dog | `dogRepository.ts` | `GetDogFunction`, `PutRegistrationFunction` |
| emailSuppression | `emailSuppressionRepository.ts` | `SesNotificationFunction`, `lib/emailSuppression` |
| emailTemplate | `emailTemplateRepository.ts` | `GetEmailTemplatesFunction`, `PutEmailTemplateFunction`, `RepairDataVersionsFunction` |
| event | `eventRepository.ts` | `lib/event.ts`, `lib/startNumbers.ts`, `lib/stationTurns.ts`, `lib/statsRebuild.ts`, `lib/user.ts`, `GetEventsFunction`, `GetAdminEventsFunction`, `PutInvitationAttachmentFunction`, `RunMigrationFunction`, `SendRegistrationMessagesFunction` |
| eventStats | `eventStatsRepository.ts` | `lib/stats.ts`, `lib/statsRebuild.ts` |
| eventType | `eventTypeRepository.ts` | `GetDogFunction`, `GetEventTypesFunction`, `PutEventTypeFunction`, `KennelliittoResultsFunction`, `SearchEventKcIdChoicesFunction`, `RepairDataVersionsFunction`, `lib/officialDirectory` (`GetJudgesFunction`, `GetOfficialsFunction`), `lib/stats` |
| judge | `judgeRepository.ts` | `GetJudgesFunction` (through `lib/judge`), `PutJudgeFunction`, `PutEventTypeFunction`, `ImportCopiedEventFunction`, `RepairDataVersionsFunction` |
| official | `officialRepository.ts` | `GetOfficialsFunction` (through `lib/official`), `PutEventTypeFunction`, `RepairDataVersionsFunction` |
| location | `locationRepository.ts` | `GetLocationsFunction`, `RefreshLocationsFunction` (through `lib/location`), `RepairDataVersionsFunction` |
| organizer | `organizerRepository.ts` | `GetOrganizersFunction`, `PutOrganizerFunction`, `SearchEventKcIdChoicesFunction`, `ExportEventToStageFunction`, `ImportCopiedEventFunction`, `KennelliittoResultsFunction`, `PaymentCreateFunction`, `RefundCreateFunction`, `RepairDataVersionsFunction`, `lib/user.ts` |
| registration | `registrationRepository.ts` | every read and write of the table, and the registration's key ([KOE-1409](https://koekalenteri.atlassian.net/browse/KOE-1409)). `lib/registration.ts` (the 404 read `getRegistration`, the patch, the ready and duplicate lookups, the message bookkeeping), `lib/registrationPersistence.ts`, `lib/registrationWorkflow.ts` (the new registration's post-processing lease), `lib/event.ts`, `lib/eventResults.ts`, `lib/kennelliittoResults.ts`, `lib/payment.ts`, `lib/startList.ts`, `lib/startNumbers.ts`, `lib/stats.ts`, `lib/statsRebuild.ts`; `CopyEventFunction`, `ExportEventToStageFunction`, `GetAdminRegistrationsFunction`, `GetClassStartNumbersFunction`, `GetStationEntryFunction`, `ImportCopiedEventFunction`, `PaymentCreateFunction`, `PaymentSuccessFunction`, `PutAdminRegistrationNotesFunction`, `PutClassStartNumbersFunction`, `PutEventFunction`, `PutEventResultsFunction`, `PutInvitationAttachmentFunction`, `PutStartNumbersFunction`, `PutStationEntryFunction`, `PutStationEntryTurnFunction`, `PutStationTurnFunction`, `RefundCreateFunction`, `RefundSuccessFunction`, `SesNotificationFunction` (the delivery status a bounce or a complaint marks); `eventStatsRepository` and `transactionRepository` put its items in their transactions (`newRegistrationStatsMarkItem`, `registrationUpdateItem`) |
| transaction | `transactionRepository.ts` | `lib/payment.ts`, `PaymentCreateFunction`, `PaymentSuccessFunction`, `PaymentVerifyFunction`, `RefundCreateFunction`, `RefundSuccessFunction`, `GetRegistrationTransactionsFunction`; its transactions write the registration's payment state through `registrationUpdateItem`: a payment's or a refund's creation, its application, and a duplicate payment, each with its registration in one write. They are the only writers of the money fields (`REGISTRATION_MONEY_FIELDS` in `src/lib/registration.ts`) besides the creation mark and the open-set drop in `registrationRepository` ([KOE-1531](https://koekalenteri.atlassian.net/browse/KOE-1531)) |
| user | `userRepository.ts` | `lib/auth.ts`, `lib/user.ts` (the user list, the email lookup, the role update and the judge and official sync), `lib/email.ts` (the staff address check), `SetAdminFunction`, `SetRoleFunction`, `ImportCopiedEventFunction` |
| userLink | `userLinkRepository.ts` | `lib/auth.ts` (the Cognito link), `lib/user.ts` (the judge and official sync) |
| wsConnections | `../ws/connectionRepository.ts` | the WebSocket handlers and `lib/ws` |
