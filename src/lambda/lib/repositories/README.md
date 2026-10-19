# Repositories

Every DynamoDB table the lambdas use is read and written through one module here, and the
WebSocket connections through `../ws/connectionRepository.ts`: a handler or a `lambda/lib` module
that needs a table calls the table's repository and opens no client of its own. New table access
goes into the table's repository, or into a new `<table>Repository.ts` for a table that has none.
The epic was [KOE-1405](https://koekalenteri.atlassian.net/browse/KOE-1405), closed by
[KOE-1415](https://koekalenteri.atlassian.net/browse/KOE-1415).

## Convention

- One module per table, named `<table>Repository.ts` (`dogRepository.ts`), so it does not share a
  name with the domain modules in `src/lib` and `src/lambda/lib`.
- The module opens its client once, at module level:
  `const dynamoDB = new CustomDynamoClient(CONFIG.<table>Table)`. No class, no dependency injection.
- Functions are named by purpose, not by the DynamoDB operation: `readOfficialResults`, not
  `getItem`.
- Keys, index names and projections are written only here. A caller passes domain values (`regNo`,
  `eventId`), never a `{ pk, sk }` object or an index name.
- A client reaches only the table it was built on: no method of `CustomDynamoClient` takes another
  table, and its table and SDK clients cannot be changed or reached from outside. A write across
  tables is a function of the repository whose table is the primary one, and it uses
  `documentTransaction`, whose items each name their table.
- `src/lambda/lib/ws/connectionRepository.ts` follows the same convention and stays in the ws
  domain.

## Testing

- The repository's own test mocks `CustomDynamoClient` with `vi.doMock`, as
  `src/lambda/lib/ws/connectionRepository.test.ts` and `dogRepository.test.ts` do, and checks the
  keys it passes and the results it returns.
- A handler or lib test mocks the repository module, not the client.
- The rules in `AGENTS.md` and `LLM_CONTEXT.md` hold: no `mock.calls`, no type assertions.

## Gate

`npm run ratchet` fails a commit that opens a DynamoDB client anywhere else
(`dynamoClientsOutsideRepositories` in `scripts/ratchet-baseline.json`, which is 0). It counts a
`CustomDynamoClient` built or subclassed in a non-test file outside this directory and
`connectionRepository.ts`, under whatever name the file imports it as, and an SDK client built
directly (`new DynamoDBClient(`, `DynamoDBDocumentClient.from(`) anywhere in the lambda code but
`utils/CustomDynamoClient.ts`, here included.

## Repositories

| Table | Module | Used by |
| --- | --- | --- |
| audit | `auditRepository.ts` | `lib/audit.ts`, which builds the records and publishes them (`ws/auditPublisher`): `audit` and `auditStrict` for every lambda that audits, `auditTrail` for `GetEventAuditTrailFunction` and `GetRegistrationAuditTrailFunction` ([KOE-1415](https://koekalenteri.atlassian.net/browse/KOE-1415)) |
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
