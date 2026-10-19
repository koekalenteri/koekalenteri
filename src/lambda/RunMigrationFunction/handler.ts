import type { DayRekeying } from '../../lib/storedDays'
import type { JsonDog, JsonDogEvent, JsonRegistration, RegistrationClass } from '../../types'
import type { JsonEventStatsItem } from '../../types/Stats'
import { createHash } from 'node:crypto'
import { getEventSeason } from '../../lib/event'
import { legacyDay, rekeyDogDays, rekeyEventDays, rekeyRegistrationDays } from '../../lib/storedDays'
import { mapWithConcurrency } from '../../lib/utils'
import { isConditionalCheckFailure, isTransactionCanceled } from '../lib/api-gw'
import { authorizeAdmin } from '../lib/auth'
import { retryOnConditionFailure } from '../lib/conditionalWrite'
import { markMigrationApplied, readAppliedMigrations } from '../lib/dataVersions'
import { isDirectInvoke, LambdaError, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { createPatch } from '../lib/patch'
import { readAllDogs, readDog, writeMigratedDog } from '../lib/repositories/dogRepository'
import { readAllEvents, readEvent, writeMigratedEvent } from '../lib/repositories/eventRepository'
import {
  moveOrganizerEventStatsRow,
  organizerStatsKey,
  organizerStatsRowEvent,
  readAllOrganizerEventStats,
  readOrganizerEventStatsRow,
} from '../lib/repositories/eventStatsRepository'
import {
  readEventRegistrations,
  readRegistration,
  readRegistrationEventIds,
  writeMigratedRegistration,
} from '../lib/repositories/registrationRepository'

/**
 * What a migration did to a row: whether it changed it, or, for one that also reports what it could
 * not read, both.
 */
type MigrationOutcome = boolean | DayRekeying

type Migration<T> = {
  name: string
  run: (row: T) => MigrationOutcome
}

const eventMigrations: Migration<JsonDogEvent>[] = [
  {
    // Rows that predate updatedAt get one; the shared bump below writes the actual value.
    name: 'populateUpdatedAt',
    run: (event) => event.updatedAt === undefined,
  },
  {
    // The organizer index (readOrganizerEvents) is keyed on a top-level copy of organizer.id; rows
    // written before the copy existed are not in the index until they carry it (KOE-1341).
    name: 'backfillOrganizerId',
    run: (event) => {
      const organizerId = event.organizer?.id
      if (!organizerId || event.organizerId === organizerId) return false

      event.organizerId = organizerId
      return true
    },
  },
  {
    name: 'fixSeasonFromStartDate',
    run: (event) => {
      const season = getEventSeason(event.startDate)

      if (!season || event.season === season) {
        return false
      }

      event.season = season
      return true
    },
  },
  {
    /**
     * KOE-1266: events that predate the start number publishing feature have no
     * `startNumbersPublished`, and an absent field means published — so publishing their start
     * list would publish the numbers too, skipping the KOE-1006 decision entirely. Write the
     * explicit state that matches what each event's public list shows today: `false` wherever the
     * start list (or a class's list) is not published, so the numbers stay hidden until the
     * secretary releases them; nothing is written where the list is already out, because those
     * numbers are visible and must stay visible.
     */
    name: 'backfillStartNumbersPublished',
    run: (event) => {
      if (event.startNumbersPublished !== undefined) return false

      const list = event.startListPublished

      if (list === false) {
        // An explicitly unpublished list: the numbers decision is still fully open.
        event.startNumbersPublished = false
      } else if (list && typeof list === 'object') {
        // A per-class map: hold back only the classes whose list is not out.
        const perClass: Partial<Record<RegistrationClass, boolean>> = {}
        let allPublished = true
        for (const [eventClass, published] of Object.entries(list) as [RegistrationClass, boolean | undefined][]) {
          perClass[eventClass] = Boolean(published)
          if (!published) allPublished = false
        }
        if (allPublished) return false
        event.startNumbersPublished = perClass
      } else {
        // true or absent: the list is public and has been showing its numbers — leave it be.
        return false
      }

      return true
    },
  },
  {
    // KOE-1547: every calendar day of the event as a key: the trial's and the entry's days, the
    // classes', the dates', the posts', the Kennelliitto trial's, and the published-day lists.
    // `legacyDay` reads each form ever stored and is never narrowed (see `legacyStoredDay`).
    name: 'storeEventDaysAsKeys',
    run: (event) => rekeyEventDays(event, legacyDay),
  },
]

const registrationMigrations: Migration<JsonRegistration>[] = [
  {
    // KOE-1547: the entry's days, its group's and its frozen start group's (and the starts' keys
    // that name the day), and the dog's birth date and results' days, as keys.
    name: 'storeRegistrationDaysAsKeys',
    run: (registration) => rekeyRegistrationDays(registration, legacyDay),
  },
]

const dogMigrations: Migration<JsonDog>[] = [
  {
    // KOE-1547: the birth date and the results' days of the dogs the Kennel Club lookup stored.
    name: 'storeDogDaysAsKeys',
    run: (dog) => rekeyDogDays(dog, legacyDay),
  },
]

const organizerStatsMigrations: Migration<JsonEventStatsItem>[] = [
  {
    // KOE-1547: an organizer's event row is keyed by the event's start day; a row counted before the
    // event's days were keys is keyed by the instant, and registrations counted after the migration
    // would open a second row beside it. The row is moved to the key of the day.
    name: 'storeOrganizerStatsDaysAsKeys',
    // The move writes the row's `date` from the key it moves to.
    run: (row) => {
      const event = organizerStatsRowEvent(row)
      if (!event) return false
      const day = legacyDay(event.startDate)
      if (!day) return { changed: false, unreadable: true }
      if (day === event.startDate) return false
      row.SK = organizerStatsKey({ ...event, startDate: day }).SK
      return true
    },
  },
]

/**
 * Identifies the code of a migration. The text is the bundled function, so a change of the build can
 * alter it without a source change (the migration then reruns once, which is harmless) and a change
 * inside a helper the migration calls does not alter it (that migration needs a new name).
 */
const hashOf = ({ run }: Migration<never>) => createHash('sha256').update(run.toString()).digest('hex').slice(0, 16)

type Pending<T> = { hash: string; migration: Migration<T> }

/**
 * A row as read: a copy from before the migrations ran, to diff what they changed, and what each
 * pending migration did to it.
 */
type ReadRow<T> = { before: T; item: T; outcomes: DayRekeying[] }

const toRekeying = (outcome: MigrationOutcome): DayRekeying =>
  typeof outcome === 'boolean' ? { changed: outcome, unreadable: false } : outcome

const migrateRow = <T extends object>(item: T, pending: Pending<T>[]): ReadRow<T> => {
  const before = structuredClone(item)
  return { before, item, outcomes: pending.map(({ migration }) => toRekeying(migration.run(item))) }
}

const isChanged = <T>(row: ReadRow<T>) => row.outcomes.some(({ changed }) => changed)

/**
 * A table the migrations walk: how its rows are read (a loader per batch, so a large table is never
 * held in memory at once), how a row is read again after a conflict, and how a migrated row is
 * written on condition that nobody moved it since it was read.
 */
interface MigratedTable<T extends object> {
  name: string
  migrations: Migration<T>[]
  /** The loaders of the table's rows, a batch each. */
  loaders: () => Promise<Array<() => Promise<T[]>>>
  /** The row as last written, or undefined once it is gone. */
  reread: (row: ReadRow<T>) => Promise<T | undefined>
  /** Writes the changes; throws a condition failure when the row moved since `row.before`. */
  write: (row: ReadRow<T>) => Promise<void>
  /** Names the row in a conflict and in the log. */
  id: (row: T) => string
  /** Whether a failed write means the row moved meanwhile; a failed condition unless said otherwise. */
  isConflict?: (error: unknown) => boolean
}

/**
 * The changes of a row and the bump of its `updatedAt`. Every migration's change must reach browsers
 * that already cache the row: the incremental fetch (`changedSince` in lambda/lib/incremental.ts)
 * reads `updatedAt`, and a row rewritten without moving it comes back as unchanged. `modifiedAt`
 * stays untouched: it records a user's edit, which this is not.
 *
 * Only the fields the migrations changed are written. A whole-row Put would also write back every
 * other field as read, and some writers move fields without touching `updatedAt` (a start list
 * publication, the registration group lock), so the condition could not see them and the Put would
 * undo them.
 */
const bumpedChanges = <T extends object>(row: ReadRow<T>) => {
  const { remove, set } = createPatch(row.item, row.before)
  return { ...(remove ? { remove } : {}), set: { ...set, updatedAt: new Date().toISOString() } }
}

const eventTable: MigratedTable<JsonDogEvent> = {
  id: (event) => event.id,
  loaders: () => Promise.resolve([() => readAllEvents(true)]),
  migrations: eventMigrations,
  name: 'event',
  reread: ({ item }) => readEvent(item.id, true),
  write: (row) => writeMigratedEvent(row.item.id, bumpedChanges(row), row.before.updatedAt),
}

/** Batches read at once: the registration table is read an event's rows at a time. */
const LOADER_CONCURRENCY = 4

const registrationTable: MigratedTable<JsonRegistration> = {
  id: (registration) => `${registration.eventId}/${registration.id}`,
  loaders: async () => (await readRegistrationEventIds()).map((eventId) => () => readEventRegistrations(eventId, true)),
  migrations: registrationMigrations,
  name: 'registration',
  reread: ({ item }) => readRegistration(item.eventId, item.id, true),
  write: (row) => writeMigratedRegistration(row.item.eventId, row.item.id, bumpedChanges(row), row.before.updatedAt),
}

const dogTable: MigratedTable<JsonDog> = {
  id: (dog) => dog.regNo,
  loaders: () => Promise.resolve([readAllDogs]),
  migrations: dogMigrations,
  name: 'dog',
  reread: ({ item }) => readDog(item.regNo),
  // A dog row has no updatedAt to bump; nothing fetches dogs by it.
  write: (row) => {
    const { remove, set } = createPatch(row.item, row.before)
    return writeMigratedDog(row.before, { ...(remove ? { remove } : {}), ...(set ? { set } : {}) })
  },
}

const organizerStatsTable: MigratedTable<JsonEventStatsItem> = {
  id: (row) => `${row.PK}/${row.SK}`,
  // The move is a transaction: a registration counted on the row since it was read cancels it.
  isConflict: (error) => isConditionalCheckFailure(error) || isTransactionCanceled(error),
  loaders: () => Promise.resolve([() => readAllOrganizerEventStats()]),
  migrations: organizerStatsMigrations,
  name: 'organizer stats',
  reread: async ({ before }) => {
    const event = organizerStatsRowEvent(before)
    return event && readOrganizerEventStatsRow(event)
  },
  // A move: the counters are added to the row of the day's key, which a registration counted since
  // the migration may have opened already, and the old row is deleted on condition it is as read.
  write: async ({ before, item }) => {
    const from = organizerStatsRowEvent(before)
    const to = organizerStatsRowEvent(item)
    if (from && to) await moveOrganizerEventStatsRow(from, to, before, new Date().toISOString())
  },
}

const MAX_WRITE_ATTEMPTS = 3

/** Rows are independent partitions; a modest fan-out keeps a large table well inside the timeout. */
const WRITE_CONCURRENCY = 10

/**
 * Writes a migrated row. A row changed by someone else since it was read is read again and migrated
 * afresh, up to MAX_WRITE_ATTEMPTS writes. Returns what the migrations did to the row that was finally
 * written, nothing when the row is gone or needs nothing any more.
 */
const writeRow = <T extends object>(table: MigratedTable<T>, row: ReadRow<T>, pending: Pending<T>[]) =>
  retryOnConditionFailure<ReadRow<T> | undefined, DayRekeying[]>({
    exhausted: () => new LambdaError(409, `${table.name} ${table.id(row.item)} kept changing while it was migrated`),
    initial: row,
    isConflict: table.isConflict,
    maxAttempts: MAX_WRITE_ATTEMPTS,
    reread: async () => {
      const fresh = await table.reread(row)
      return fresh && migrateRow(fresh, pending)
    },
    work: async (current) => {
      // A row deleted meanwhile needs nothing any more.
      if (!current) return pending.map(() => ({ changed: false, unreadable: false }))
      if (isChanged(current)) await table.write(current)
      return current.outcomes
    },
  })

/** One batch of a table: read, migrated, and the changed rows written. */
const migrateBatch = async <T extends object>(
  table: MigratedTable<T>,
  load: () => Promise<T[]>,
  pending: Pending<T>[]
): Promise<DayRekeying[][]> => {
  const rows = (await load()).map((item) => migrateRow(item, pending))
  const unchanged = rows.filter((row) => !isChanged(row)).map((row) => row.outcomes)
  const written = await mapWithConcurrency(rows.filter(isChanged), WRITE_CONCURRENCY, (row) =>
    writeRow(table, row, pending)
  )
  logUnreadable(table, rows, pending)
  return [...unchanged, ...written]
}

/** The rows a migration could not read a day of, named in the log so the leftovers can be found. */
const logUnreadable = <T extends object>(table: MigratedTable<T>, rows: ReadRow<T>[], pending: Pending<T>[]) => {
  pending.forEach(({ migration }, index) => {
    const ids = rows.filter((row) => row.outcomes[index].unreadable).map((row) => table.id(row.item))
    if (ids.length)
      logger.warn('migration left unreadable values', { ids: ids.slice(0, 50), migration: migration.name })
  })
}

type MigrationResult = { count: number; name: string; unreadable?: number }

/**
 * Runs a table's pending migrations over every row, a batch at a time. After a failed write no further
 * row is started (mapWithConcurrency stops there), and the run answers with the failure only once the
 * rows already being written have finished. A half-done run is safe because every migration can be run
 * again.
 */
const migrateTable = async <T extends object>(
  table: MigratedTable<T>,
  pending: Pending<T>[]
): Promise<MigrationResult[]> => {
  const loaders = await table.loaders()
  const batches = await mapWithConcurrency(loaders, LOADER_CONCURRENCY, (load) => migrateBatch(table, load, pending))
  const outcomes = batches.flat()
  return pending.map(({ migration }, index) => {
    const unreadable = outcomes.filter((row) => row[index].unreadable).length
    return {
      count: outcomes.filter((row) => row[index].changed).length,
      name: migration.name,
      ...(unreadable ? { unreadable } : {}),
    }
  })
}

const allMigrationNames = [eventMigrations, registrationMigrations, dogMigrations, organizerStatsMigrations].flatMap(
  (migrations: Migration<never>[]) => migrations.map(({ name }) => name)
)

/** A table with the migrations still to run on it, or nothing when none are. */
type TableRun = () => Promise<MigrationResult[]>

const pendingRun = <T extends object>(
  table: MigratedTable<T>,
  applied: Map<string, string | undefined>
): TableRun | undefined => {
  const pending = table.migrations
    .map((migration) => ({ hash: hashOf(migration), migration }))
    .filter(({ hash, migration }) => applied.get(migration.name) !== hash)
  if (!pending.length) return undefined
  return async () => {
    const results = await migrateTable(table, pending)
    // Only after every write of the table went through: a failed run records nothing and the next one
    // starts over. A migration that left values it could not read is not recorded either, so the next
    // deploy runs it again (it changes nothing it changed already) and reports them again.
    await Promise.all(
      results.map(({ count, name, unreadable }, index) =>
        unreadable ? undefined : markMigrationApplied(name, count, pending[index].hash)
      )
    )
    return results
  }
}

/**
 * The admin button (API Gateway) is a forced full run, so a correction run is always possible. The
 * deploy invokes the function directly and only the migrations the registry does not list as
 * applied with the same code hash run, which makes a deploy without new migrations one registry
 * read and no table scan. The tables are migrated one after another.
 */
const runMigrationLambda = lambda('runMigration', async (event) => {
  const direct = isDirectInvoke(event)
  if (!direct) await authorizeAdmin(event)

  const applied = direct ? await readAppliedMigrations(allMigrationNames) : new Map<string, string | undefined>()
  const runs = [
    pendingRun(eventTable, applied),
    pendingRun(registrationTable, applied),
    pendingRun(dogTable, applied),
    pendingRun(organizerStatsTable, applied),
  ].filter((run): run is TableRun => !!run)

  if (!runs.length) {
    logger.info('no migrations pending')
    return response(200, [], event)
  }

  const migrationResults = (await mapWithConcurrency(runs, 1, (run) => run())).flat()
  logger.info('migrations applied', { migrations: migrationResults })

  return response(200, migrationResults, event)
})

export default runMigrationLambda
