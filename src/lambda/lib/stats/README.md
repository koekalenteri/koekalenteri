# Stats

This folder is the Lambda-side statistics layer over the event stats table (`EventStatsTable`). It decides what is counted and when; every read and write of the table goes through `../repositories/eventStatsRepository.ts`, and the events and registrations it counts are read through their own repositories (`../repositories/README.md`).

## Partitions and their writers

| Partition        | Keys                                                  | Written by                                                                                                                                                                       |
| ---------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizer`      | `ORG#`                                                | Only the rebuild, nightly and after every deploy.                                                                                                                                |
| `participation`  | `STAT#`, `TOTALS#`, `BUCKETS#`, `RETENTION#`, `YEARS` | Only the rebuild (`rebuild.ts`) through `RebuildStatsFunction`: nightly, and after every backend deploy (the "Start the stats rebuild" step in `.github/workflows/release.yml`). |
| `capacity`       | `CAPACITY#`                                           | Only the rebuild, nightly and after every deploy.                                                                                                                                |
| `judges`         | `JUDGE#`                                              | Only the rebuild, nightly and after every deploy.                                                                                                                                |
| `eventBreakdown` | `BREAKDOWN#`                                          | Only the rebuild, nightly and after every deploy.                                                                                                                                |

The prefixes are `STATS_KEY_PREFIX` and `YEARS_PK` in `eventStatsRepository.ts`; `getStatsRecordPartition` in `rebuild.ts` sorts a key into its partition.

Every partition is recomputed in one pass from the events and the registrations, which is simpler and cannot drift: nothing else writes the table, so a registration, a payment or a group move shows at the next run, and no writer can race the pass. An event's organizer or start date moving needs no writer either: the run writes the row under the key the event holds now and deletes the key it held before, across years too (`regenerateYear`), and an event deleted since leaves its row the same way, as the rebuild reads live events only.

Only a finished entry counts (`isFinishedEntry` in `src/lib/registration.ts`, the one rule `eventClassStats.ts` reads too): a row still in the payment step, or one whose payment was charged twice, counts in no partition, also when that payment has gone back to the payer.

## Public interface

Code outside this folder imports only these:

| Caller                       | Module               | Exports                                                                                                                                                                                                                                       |
| ---------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetStatsFunction`           | `stats.ts`           | `getAvailableYears`, `getBreedStartBreakdown`, `getCapacityStats`, `getCapacityStatsAllEventTypes`, `getDogHandlerBuckets`, `getDogsPerHandlerBuckets`, `getEventBreakdown`, `getRetentionStats`, `getYearlyBreakdown`, `getYearlyTotalStats` |
| `GetAdminStatsFunction`      | `stats.ts`           | `getCapacityStats`, `getJudgeWorkload`, `getOrganizerStats`                                                                                                                                                                                   |
| `GetEventClassStatsFunction` | `eventClassStats.ts` | `getEventClassStats`                                                                                                                                                                                                                          |
| `RebuildStatsFunction`       | `rebuild.ts`         | `rebuildStats`                                                                                                                                                                                                                                |

The other exports are internal to the folder. `rebuild.ts` imports `eventStatsYear`, `bucketForCount`, `hashStatValue`, `statIdentifier` and `participationIdentifiers` from `stats.ts`; `getStatsRecordPartition`, `getEventStatsRecordYear` and `buildStatsRecords` (`rebuild.ts`) are exported only for the tests. Do not import them from outside the folder.

## Module responsibilities

- `stats.ts`: the reads behind `/stats` and `/admin/stats`, and the small rules the rebuild shares (the stats year, the buckets, the identifiers).
- `eventClassStats.ts`: the season's trials class by class for the application administrator's export (`/admin/stats/event-classes`, KOE-1595). Unlike the `BREAKDOWN#` rows (`EventBreakdownEntry`), it is per event and class, keeps tentative and upcoming trials, and is worked out from the events and registrations on each request, not stored; the counting is the pure `buildEventClassStats` in `src/lib/eventClassStats.ts`.
- `rebuild.ts`: regenerates the whole table from the events and registrations tables, one year at a time (`regenerateYear` has why the year's rows are written before its stale keys are deleted).
