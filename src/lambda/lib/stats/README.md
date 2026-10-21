# Stats

This folder is the Lambda-side statistics layer over the event stats table (`EventStatsTable`). It decides what is counted and when; every read and write of the table goes through `../repositories/eventStatsRepository.ts`, and the events and registrations it counts are read through their own repositories (`../repositories/README.md`).

## Partitions and their writers

| Partition | Keys | Written by |
| --- | --- | --- |
| `organizer` | `ORG#` | Incrementally, on every change that moves an event's counters: a registration's save, a copied event's import, an event edit or migration that changes the organizer or the start date (`stats.ts`). Rebuilt only by the manual `RebuildAllStatsFunction`. |
| `participation` | `STAT#`, `TOTALS#`, `BUCKETS#`, `RETENTION#`, `YEARS` | Only the rebuild (`rebuild.ts`), nightly through `RebuildStatsFunction`. |
| `capacity` | `CAPACITY#` | Only the rebuild, nightly. |
| `judges` | `JUDGE#` | Only the rebuild, nightly. |
| `eventBreakdown` | `BREAKDOWN#` | Only the rebuild, nightly. |

The prefixes are `STATS_KEY_PREFIX` and `YEARS_PK` in `eventStatsRepository.ts`; `getStatsRecordPartition` in `rebuild.ts` sorts a key into its partition.

Counting distinct dogs, handlers and breeds cannot be done incrementally without a read-then-write under contention, so those partitions are recomputed in one pass instead, which is simpler and cannot drift. The organizer counters are blind `ADD`s that a registration's save applies at any time, so a delete-then-write pass over `ORG#` would race them: a registration landing mid-run could be lost or counted twice. That is why the scheduled run (`REBUILDABLE_STATS_PARTITIONS`) leaves `organizer` out, and why the full rebuild (`ALL_STATS_PARTITIONS`) is a manual invocation, run when writes are quiet. It is also the only repair for an `ORG#` row that drifted.

## Public interface

Code outside this folder imports only these:

| Caller | Module | Exports |
| --- | --- | --- |
| `GetStatsFunction` | `stats.ts` | `getAvailableYears`, `getBreedStartBreakdown`, `getCapacityStats`, `getCapacityStatsAllEventTypes`, `getDogHandlerBuckets`, `getDogsPerHandlerBuckets`, `getEventBreakdown`, `getRetentionStats`, `getYearlyBreakdown`, `getYearlyTotalStats` |
| `GetAdminStatsFunction` | `stats.ts` | `getCapacityStats`, `getJudgeWorkload`, `getOrganizerStats` |
| `lib/registrationWorkflow.ts` | `stats.ts` | `applyNewRegistrationStatsOnce`, `updateEventStatsForRegistration` |
| `ImportCopiedEventFunction` | `stats.ts` | `sumNewRegistrationStatDeltas`, `updateOrganizerEventStats` |
| `PutEventFunction`, `RunMigrationFunction` | `stats.ts` | `moveOrganizerEventStats` |
| `RebuildStatsFunction` | `rebuild.ts` | `createHandler`, `REBUILDABLE_STATS_PARTITIONS` |
| `RebuildAllStatsFunction` | `rebuild.ts` | `createHandler`, `ALL_STATS_PARTITIONS` |

The other exports are internal to the folder. `rebuild.ts` imports `eventStatsYear`, `bucketForCount`, `hashStatValue`, `statIdentifier` and `participationIdentifiers` from `stats.ts`; `calculateStatDeltas` (`stats.ts`) and `getStatsRecordPartition`, `getEventStatsRecordYear` and `buildStatsRecords` (`rebuild.ts`) are exported only for the tests. Do not import them from outside the folder.

## Module responsibilities

- `stats.ts`: the reads behind `/stats` and `/admin/stats`, and the organizer counters: the deltas of a registration change, the once-only apply of a new registration's counters under its post-processing lease, and the move of an event's row when its organizer or start date changes.
- `rebuild.ts`: regenerates the given partitions from the events and registrations tables, one year at a time (`regenerateYear` has why the year's rows are written before its stale keys are deleted).
