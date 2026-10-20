import type { DayRekeying } from '../../lib/storedDays'
import type { JsonDog, JsonDogEvent, JsonRegistration, JsonUser, RegistrationClass } from '../../types'
import type { JsonEventStatsItem } from '../../types/Stats'
import type { OrganizerRepoints } from './organizerRepoints'
import { createHash } from 'node:crypto'
import { getEventSeason } from '../../lib/event'
import { legacyDecoder, rekeyDogDays, rekeyEventDays, rekeyRegistrationDays } from '../../lib/storedDays'
import { mapWithConcurrency } from '../../lib/utils'
import { authorizeAdmin } from '../lib/auth'
import { retryOnConditionFailure } from '../lib/conditionalWrite'
import { bumpDataVersion, markMigrationApplied, readAppliedMigrations } from '../lib/dataVersions'
import { isDirectInvoke, LambdaError, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { createPatch } from '../lib/patch'
import { readAllDogs, readDog, writeMigratedDog } from '../lib/repositories/dogRepository'
import { readAllEvents, readEvent, writeMigratedEvent } from '../lib/repositories/eventRepository'
import {
  moveOrganizerEventStatsRow,
  ORGANIZER_STATS_MOVE_RETRY,
  organizerStatsKey,
  organizerStatsRowEvent,
  readAllOrganizerEventStats,
  readOrganizerEventStatsRow,
} from '../lib/repositories/eventStatsRepository'
import { readOrganizersIncludingDeleted } from '../lib/repositories/organizerRepository'
import {
  readEventRegistrations,
  readRegistration,
  readRegistrationEventIds,
  writeMigratedRegistration,
} from '../lib/repositories/registrationRepository'
import { readAllUsers, readUser, writeMigratedUserRoles } from '../lib/repositories/userRepository'
import { moveOrganizerEventStats } from '../lib/stats'
import { userScopes } from '../lib/user'
import { findOrganizerRepoints, repointRoles, unmappableRoleIds } from './organizerRepoints'

/**
 * What a migration did to a row: whether it changed it, or, for one that also reports what it could
 * not read, both.
 */
type MigrationOutcome = boolean | DayRekeying

/** What a run reads once, before any row, for the migrations that need more than the row itself. */
interface MigrationContext {
  organizerRepoints: OrganizerRepoints
}

/** The rows a migration left as they were for someone to look at, and why, for the release log. */
interface SkippedRows {
  ids: string[]
  detail: Record<string, unknown>[]
}

/**
 * One migration of the rows of one table: `run` changes the row in place and answers what it did, and
 * `skipped`, where there is one, names the rows it could not decide about.
 */
interface Migration<T> {
  name: string
  run: (row: T, context: MigrationContext) => MigrationOutcome
  skipped?: (rows: T[], context: MigrationContext) => SkippedRows
}

const eventMigrations: Migration<JsonDogEvent>[] = [
  {
    // Rows that predate updatedAt get one; the shared bump below writes the actual value.
    name: 'populateUpdatedAt',
    run: (event) => event.updatedAt === undefined,
  },
  {
    // The organizer index (readOrganizerEvents) is keyed on a top-level copy of organizer.id; rows
    // written before the copy existed are not in the index until they carry it (KOE-1341). A deleted
    // row stays out of the index it was never in (KOE-1585).
    name: 'backfillOrganizerId',
    run: (event) => {
      const organizerId = event.organizer?.id
      if (event.deletedAt || !organizerId || event.organizerId === organizerId) return false

      event.organizerId = organizerId
      return true
    },
  },
  {
    // The season indexes are what the public list and the admin season lists read. A deleted row is
    // not given a season it lacked, nor moved to another season's partition (KOE-1585).
    name: 'fixSeasonFromStartDate',
    run: (event) => {
      if (event.deletedAt) return false

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
    /**
     * KOE-1580: an event copied from another environment names that environment's organizer id,
     * which the table here does not hold, so the club shows twice in the admin list and the event
     * reaches neither the club's members nor its merchant. Such an event moves to the live organizer
     * of the same name; `findOrganizerRepoints` decides which.
     */
    name: 'repointOrphanOrganizer',
    run: (event, { organizerRepoints }) => {
      const target = organizerRepoints.targets.get(event.organizer?.id ?? '')
      if (!target) return false

      event.organizer = { id: target.id, name: target.name }
      event.organizerId = target.id
      return true
    },
    skipped: (events, { organizerRepoints }) => ({
      detail: [...organizerRepoints.unmatched].map(([organizerId, unmatched]) => ({ organizerId, ...unmatched })),
      ids: events
        .filter(({ deletedAt, organizer }) => !deletedAt && organizerRepoints.unmatched.has(organizer?.id ?? ''))
        .map(({ id }) => id),
    }),
  },
  {
    // KOE-1547: every calendar day of the event as a key: the trial's and the entry's days, the
    // classes', the dates', the posts', the Kennelliitto trial's, and the published-day lists.
    // The event rule reads each form ever stored, a start or an end of day an hour off as the day it
    // was stored for, and is never narrowed (see `legacyStoredEventDay`). The rule is named in a
    // literal, so the hash of this body names it whatever a rebuild calls the functions.
    name: 'storeEventDaysAsKeys',
    run: (event) => rekeyEventDays(event, legacyDecoder('event')),
  },
]

/** A user migration may change only `roles`: that is all the runner writes of a user row. */
const userMigrations: Migration<JsonUser>[] = [
  {
    // KOE-1580: the roles on an orphan organizer id follow its events to the live organizer.
    name: 'repointOrphanOrganizerRoles',
    run: (user, { organizerRepoints }) => {
      const roles = repointRoles(user.roles, organizerRepoints.targets)
      if (!roles) return false

      user.roles = roles
      return true
    },
    skipped: (users, { organizerRepoints }) => {
      const detail = users
        .map((user) => ({ organizerIds: unmappableRoleIds(user.roles, organizerRepoints), userId: user.id }))
        .filter(({ organizerIds }) => organizerIds.length > 0)
      return { detail, ids: detail.map(({ userId }) => userId) }
    },
  },
]

const registrationMigrations: Migration<JsonRegistration>[] = [
  {
    // KOE-1547: the entry's days, its group's and its frozen start group's (and the starts' keys
    // that name the day), and the dog's birth date and results' days, as keys.
    name: 'storeRegistrationDaysAsKeys',
    run: (registration) =>
      rekeyRegistrationDays(registration, { dogDay: legacyDecoder('dog'), eventDay: legacyDecoder('event') }),
  },
]

const dogMigrations: Migration<JsonDog>[] = [
  {
    // KOE-1547: the birth date and the results' days of the dogs the Kennel Club lookup stored.
    name: 'storeDogDaysAsKeys',
    run: (dog) => rekeyDogDays(dog, legacyDecoder('dog')),
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
      const day = legacyDecoder('event')(event.startDate)
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

const migrateRow = <T extends object>(item: T, pending: Pending<T>[], context: MigrationContext): ReadRow<T> => {
  const before = structuredClone(item)
  return { before, item, outcomes: pending.map(({ migration }) => toRekeying(migration.run(item, context))) }
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
  /** The writes of a row before the run gives up; MAX_WRITE_ATTEMPTS unless said otherwise. */
  maxAttempts?: number
  /** The wait before a row is read and written again; none unless said otherwise. */
  wait?: (attempt: number) => Promise<void>
  /** After the run of the table, also a failed one: the rows whose writes landed. */
  afterWrites?: (written: ReadRow<T>[]) => Promise<void>
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

/**
 * Whether the migrations moved the event to another organizer (KOE-1580), whose organizer stats row
 * (ORG#, keyed on the organizer and the start) then has to come along. A start rekeyed alone is moved
 * by `storeOrganizerStatsDaysAsKeys`; with an organizer change the move goes to the new key whole.
 */
const movesOrganizer = ({ before, item }: ReadRow<JsonDogEvent>) =>
  Boolean(before.organizer?.id && item.organizer?.id) && before.organizer?.id !== item.organizer?.id

/**
 * The organizer stats move first, as PutEvent moves them on an edit, but before the write rather than
 * after it: a move that fails leaves the event as it was, and the next run finds it again. The other
 * way round the event would already name its new organizer, no run would look at it again, and the
 * counters would stay under the old key, which the nightly rebuild never touches. A move repeated after
 * a failed write finds no old row and returns at once.
 */
const writeMigratedEventRow = async (row: ReadRow<JsonDogEvent>) => {
  if (movesOrganizer(row)) await moveOrganizerEventStats(row.before, row.item)
  await writeMigratedEvent(row.item.id, bumpedChanges(row), row.before.updatedAt)
}

/** The event table, over the events the run read once for its context. */
const eventTable = (events: JsonDogEvent[]): MigratedTable<JsonDogEvent> => ({
  id: (event) => event.id,
  loaders: () => Promise.resolve([() => Promise.resolve(events)]),
  migrations: eventMigrations,
  name: 'event',
  reread: ({ item }) => readEvent(item.id, true),
  write: writeMigratedEventRow,
})

/** The cached user lists a role change moves a user between, which have to be fetched again. */
const changedUserScopes = (rows: ReadRow<JsonUser>[]) => [
  ...new Set(rows.flatMap(({ before, item }) => [...userScopes(before), ...userScopes(item)])),
]

const userTable: MigratedTable<JsonUser> = {
  // The users whose roles were written move between cached user lists, so their scopes get one
  // version bump, also when a later write fails: a rerun leaves the rows already written alone.
  afterWrites: (written) => bumpDataVersion('users', changedUserScopes(written)),
  id: (user) => user.id,
  loaders: () => Promise.resolve([readAllUsers]),
  migrations: userMigrations,
  name: 'user',
  reread: ({ item }) => readUser(item.id, true),
  // The roles the migrations gave the user, on condition they are still the ones read, with the bump
  // that lets the user list's incremental fetch hand the row to clients that already cache it.
  write: ({ before, item }) =>
    writeMigratedUserRoles(item.id, item.roles ?? {}, before.roles, new Date().toISOString()),
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
  // The move is a transaction: a registration counted on the row since it was read cancels it. It is
  // retried as a save's move of the row is, with a wait, since registrations come in bursts.
  ...ORGANIZER_STATS_MOVE_RETRY,
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
const WRITE_CONCURRENCY = 5

/**
 * Writes a migrated row. A row changed by someone else since it was read is read again and migrated
 * afresh, up to the table's attempts (MAX_WRITE_ATTEMPTS unless it says). Returns what the migrations
 * did to the row that was finally written, nothing when the row is gone or needs nothing any more.
 */
const writeRow = <T extends object>(
  table: MigratedTable<T>,
  row: ReadRow<T>,
  pending: Pending<T>[],
  run: TableRunState<T>
) =>
  retryOnConditionFailure<ReadRow<T> | undefined, DayRekeying[]>({
    exhausted: () => new LambdaError(409, `${table.name} ${table.id(row.item)} kept changing while it was migrated`),
    initial: row,
    isConflict: table.isConflict,
    maxAttempts: table.maxAttempts ?? MAX_WRITE_ATTEMPTS,
    reread: async () => {
      const fresh = await table.reread(row)
      return fresh && migrateRow(fresh, pending, run.context)
    },
    wait: table.wait,
    work: async (current) => {
      // A row deleted meanwhile needs nothing any more.
      if (!current) return pending.map(() => ({ changed: false, unreadable: false }))
      if (isChanged(current)) {
        await table.write(current)
        run.written.push(current)
      }
      return current.outcomes
    },
  })

/** What one run of a table reads once and collects as it goes. */
interface TableRunState<T> {
  context: MigrationContext
  /** The rows whose writes landed, for `afterWrites`. */
  written: ReadRow<T>[]
}

/** What one batch came to: each row's outcomes, and each pending migration's skipped rows in it. */
interface BatchResult {
  outcomes: DayRekeying[][]
  skipped: (SkippedRows | undefined)[]
}

/** One batch of a table: read, migrated, and the changed rows written. */
const migrateBatch = async <T extends object>(
  table: MigratedTable<T>,
  load: () => Promise<T[]>,
  pending: Pending<T>[],
  run: TableRunState<T>
): Promise<BatchResult> => {
  const rows = (await load()).map((item) => migrateRow(item, pending, run.context))
  // As read, for the skip reports: the migrations change the rows in place.
  const asRead = rows.map(({ before }) => before)
  const skipped = pending.map(({ migration }) => migration.skipped?.(asRead, run.context))
  const unchanged = rows.filter((row) => !isChanged(row)).map((row) => row.outcomes)
  const written = await mapWithConcurrency(rows.filter(isChanged), WRITE_CONCURRENCY, (row) =>
    writeRow(table, row, pending, run)
  )
  logUnreadable(table, rows, pending)
  return { outcomes: [...unchanged, ...written], skipped }
}

/** The rows a migration could not read a day of, named in the log so the leftovers can be found. */
const logUnreadable = <T extends object>(table: MigratedTable<T>, rows: ReadRow<T>[], pending: Pending<T>[]) => {
  pending.forEach(({ migration }, index) => {
    const ids = rows.filter((row) => row.outcomes[index].unreadable).map((row) => table.id(row.item))
    if (ids.length)
      logger.warn('migration left unreadable values', { ids: ids.slice(0, 50), migration: migration.name })
  })
}

type MigrationResult = { count: number; name: string; skipped?: { count: number; ids: string[] }; unreadable?: number }

/** A result with the reasons for its skipped rows, which go to the log but not into the answer. */
type MigrationReport = MigrationResult & { detail?: SkippedRows['detail'] }

/** A migration's skipped rows over the batches of its table, or nothing when it skipped none. */
const skippedOf = (batches: BatchResult[], index: number) => {
  const reports = batches.map(({ skipped }) => skipped[index]).filter((report) => report?.ids.length)
  const ids = reports.flatMap((report) => report?.ids ?? [])
  if (!ids.length) return {}
  return { detail: reports.flatMap((report) => report?.detail ?? []), skipped: { count: ids.length, ids } }
}

/**
 * Runs a table's pending migrations over every row, a batch at a time. After a failed write no further
 * row is started (mapWithConcurrency stops there), and the run answers with the failure only once the
 * rows already being written have finished. A half-done run is safe because every migration can be run
 * again.
 */
const migrateTable = async <T extends object>(
  table: MigratedTable<T>,
  pending: Pending<T>[],
  run: TableRunState<T>
): Promise<MigrationReport[]> => {
  const loaders = await table.loaders()
  const batches = await mapWithConcurrency(loaders, LOADER_CONCURRENCY, (load) =>
    migrateBatch(table, load, pending, run)
  )
  const outcomes = batches.flatMap((batch) => batch.outcomes)
  return pending.map(({ migration }, index) => {
    const unreadable = outcomes.filter((row) => row[index].unreadable).length
    return {
      count: outcomes.filter((row) => row[index].changed).length,
      name: migration.name,
      ...skippedOf(batches, index),
      ...(unreadable ? { unreadable } : {}),
    }
  })
}

const allMigrationNames = [
  eventMigrations,
  userMigrations,
  registrationMigrations,
  dogMigrations,
  organizerStatsMigrations,
].flatMap((migrations: Migration<never>[]) => migrations.map(({ name }) => name))

/** A table's migrations still to run, or nothing when none are. */
const pendingOf = <T extends object>(table: MigratedTable<T>, applied: Map<string, string | undefined>) => {
  const pending = table.migrations
    .map((migration) => ({ hash: hashOf(migration), migration }))
    .filter(({ hash, migration }) => applied.get(migration.name) !== hash)
  return pending.length ? pending : undefined
}

/** A table with the migrations still to run on it. */
type TableRun = (context: MigrationContext) => Promise<MigrationReport[]>

const tableRun =
  <T extends object>(table: MigratedTable<T>, pending: Pending<T>[]): TableRun =>
  async (context) => {
    const run: TableRunState<T> = { context, written: [] }
    let results: MigrationReport[]
    try {
      results = await migrateTable(table, pending, run)
    } finally {
      if (run.written.length && table.afterWrites) await table.afterWrites(run.written)
    }
    // Only after every write of the table went through: a failed run records nothing and the next one
    // starts over. A migration that left values it could not read is not recorded either, so the next
    // deploy runs it again (it changes nothing it changed already) and reports them again. The rows a
    // migration skipped are reported, not retried: a rerun would leave the same rows.
    const applied = results
      .map((result, index) => ({ ...result, hash: pending[index].hash }))
      .filter(({ unreadable }) => !unreadable)
    await Promise.all(applied.map(({ count, hash, name }) => markMigrationApplied(name, count, hash)))
    return results
  }

const pendingRun = <T extends object>(table: MigratedTable<T>, applied: Map<string, string | undefined>) => {
  const pending = pendingOf(table, applied)
  return pending && tableRun(table, pending)
}

/** Nothing to repoint: the context of a run that migrates neither events nor users. */
const NO_REPOINTS: OrganizerRepoints = { known: new Set(), targets: new Map(), unmatched: new Map() }

/**
 * Reads what the organizer repoint decides from, once per run. A table with no live organizer would
 * leave every event an orphan with nothing to match, and recording the migration then would keep it
 * from running once the table is filled, so the run fails instead, unless no event names an organizer.
 */
const readMigrationContext = async (events: JsonDogEvent[]): Promise<MigrationContext> => {
  const organizers = await readOrganizersIncludingDeleted()
  if (events.some(({ organizer }) => organizer?.id) && organizers.every(({ deletedAt }) => deletedAt)) {
    throw new LambdaError(500, 'The organizer table holds no live organizer; refresh it before migrating')
  }
  return { organizerRepoints: findOrganizerRepoints(events, organizers) }
}

/** The run's tables in the order they are migrated, with the events read once when either needs them. */
const pendingRuns = async (applied: Map<string, string | undefined>) => {
  const pendingEvents = pendingOf(eventTable([]), applied)
  const pendingUsers = pendingOf(userTable, applied)
  const needsEvents = Boolean(pendingEvents || pendingUsers)
  const events = needsEvents ? await readAllEvents(true) : []
  // The repoint decides from the live events, as before the day migrations read the deleted ones too:
  // a deleted event's name must not split an orphan id's match. A deleted event on a matched id moves
  // with the live ones; one on an id with no live event stays as it is, unreported.
  const live = events.filter(({ deletedAt }) => !deletedAt)
  const context = needsEvents ? await readMigrationContext(live) : { organizerRepoints: NO_REPOINTS }
  // The users first: their roles are mapped from the events as read, so a run that fails after them
  // still finds the orphan events, and the mapping, the next time. The events first would leave none.
  const runs = [
    pendingUsers && tableRun(userTable, pendingUsers),
    pendingEvents && tableRun(eventTable(events), pendingEvents),
    pendingRun(registrationTable, applied),
    pendingRun(dogTable, applied),
    pendingRun(organizerStatsTable, applied),
  ].filter((run): run is TableRun => !!run)
  return { context, runs }
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
  const { context, runs } = await pendingRuns(applied)

  if (!runs.length) {
    logger.info('no migrations pending')
    return response(200, [], event)
  }

  // Answered in the registry's order, whatever order the tables ran in.
  const reports = (await mapWithConcurrency(runs, 1, (run) => run(context)))
    .flat()
    .sort((a, b) => allMigrationNames.indexOf(a.name) - allMigrationNames.indexOf(b.name))

  const skipped = reports.filter((report) => report.skipped)
  if (skipped.length) {
    logger.warn('migrations left rows as they were', {
      skipped: skipped.map(({ detail, name, skipped: rows }) => ({ detail, name, ...rows })),
    })
  }
  const migrationResults: MigrationResult[] = reports.map(({ detail: _detail, ...result }) => result)
  logger.info('migrations applied', { migrations: migrationResults })

  return response(200, migrationResults, event)
})

export default runMigrationLambda
