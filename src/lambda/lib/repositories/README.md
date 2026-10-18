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
| dog | `dogRepository.ts` | `GetDogFunction`, `PutRegistrationFunction` |
| eventType | `eventTypeRepository.ts` | `GetDogFunction`, `GetEventTypesFunction`, `PutEventTypeFunction`, `KennelliittoResultsFunction`, `SearchEventKcIdChoicesFunction`, `RepairDataVersionsFunction`, `lib/officialDirectory` (`GetJudgesFunction`, `GetOfficialsFunction`), `lib/stats` |
| judge | `judgeRepository.ts` | `GetJudgesFunction` (through `lib/judge`), `PutJudgeFunction`, `PutEventTypeFunction`, `ImportCopiedEventFunction`, `RepairDataVersionsFunction` |
| official | `officialRepository.ts` | `GetOfficialsFunction` (through `lib/official`), `PutEventTypeFunction`, `RepairDataVersionsFunction` |
| location | `locationRepository.ts` | `GetLocationsFunction`, `RefreshLocationsFunction` (through `lib/location`), `RepairDataVersionsFunction` |
| wsConnections | `../ws/connectionRepository.ts` | the WebSocket handlers and `lib/ws` |
