import type { JsonDogEvent, JsonUser, RegistrationClass } from '../../types'
import type { OrganizerRepoints } from './organizerRepoints'
import { createHash } from 'node:crypto'
import { getEventSeason } from '../../lib/event'
import { mapWithConcurrency } from '../../lib/utils'
import { authorizeAdmin } from '../lib/auth'
import { retryOnConditionFailure } from '../lib/conditionalWrite'
import { bumpDataVersion, markMigrationApplied, readAppliedMigrations } from '../lib/dataVersions'
import { isDirectInvoke, LambdaError, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { createPatch } from '../lib/patch'
import { readAllEvents, readEvent, writeMigratedEvent } from '../lib/repositories/eventRepository'
import { isSameOrganizerStatsRow } from '../lib/repositories/eventStatsRepository'
import { readOrganizersIncludingDeleted } from '../lib/repositories/organizerRepository'
import { readAllUsers, readUser, writeMigratedUserRoles } from '../lib/repositories/userRepository'
import { moveOrganizerEventStats } from '../lib/stats'
import { userScopes } from '../lib/user'
import { findOrganizerRepoints, repointRoles, unmappableRoleIds } from './organizerRepoints'

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
 * One migration of the rows of one table: `run` changes the row in place and answers whether it did,
 * and `skipped`, where there is one, names the rows it could not decide about.
 */
interface Migration<T> {
  name: string
  run: (row: T, context: MigrationContext) => boolean
  skipped?: (rows: T[], context: MigrationContext) => SkippedRows
}

const migrations: Migration<JsonDogEvent>[] = [
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
      ids: events.filter(({ organizer }) => organizerRepoints.unmatched.has(organizer?.id ?? '')).map(({ id }) => id),
    }),
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

/**
 * Identifies the code of a migration. The text is the bundled function, so a change of the build can
 * alter it without a source change (the migration then reruns once, which is harmless) and a change
 * inside a helper the migration calls does not alter it (that migration needs a new name).
 */
const hashOf = <T>({ run }: Migration<T>) => createHash('sha256').update(run.toString()).digest('hex').slice(0, 16)

type Pending<T> = { hash: string; migration: Migration<T> }

const register = <T>(list: Migration<T>[]): Pending<T>[] =>
  list.map((migration) => ({ hash: hashOf(migration), migration }))

const registeredEventMigrations = register(migrations)
const registeredUserMigrations = register(userMigrations)
const migrationNames = [...migrations, ...userMigrations].map(({ name }) => name)

const MAX_WRITE_ATTEMPTS = 3

/** Rows are independent partitions; a modest fan-out keeps a large table well inside the timeout. */
const WRITE_CONCURRENCY = 5

/**
 * A row as read and as migrated: `before` is a copy from before the migrations ran, to diff what they
 * changed and to hold the write to what was read (an event's `updatedAt`, a user's roles), which the
 * migrations leave alone on the copy but a writer moving the row does not.
 */
type ReadRow<T> = { before: T; changed: boolean[]; item: T }

const migrateRow = <T>(item: T, pending: Pending<T>[], context: MigrationContext): ReadRow<T> => {
  const before = structuredClone(item)
  return { before, changed: pending.map(({ migration }) => migration.run(item, context)), item }
}

/**
 * Whether the migrations moved the event to another organizer stats row (ORG#, keyed on the organizer
 * and the start date), whose counted registrations then have to come along.
 */
const movesOrganizerStats = ({ before, item }: ReadRow<JsonDogEvent>) =>
  Boolean(before.organizer?.id && item.organizer?.id) && !isSameOrganizerStatsRow(before, item)

/**
 * Writes only the fields the migrations changed, plus the bump. A whole-row Put would also write back
 * every other field as read, and some writers move fields without touching `updatedAt` (a start list
 * publication, the registration group lock), so the condition could not see them and the Put would
 * undo them.
 *
 * Every migration's change must reach browsers that already cache the event: the incremental fetch
 * (`changedSince` in lambda/lib/incremental.ts) reads `updatedAt`, and a row rewritten without moving
 * it comes back as unchanged, so the change would never reach anyone already holding the event.
 * `modifiedAt` stays untouched: it records a user's edit, which this is not.
 *
 * The organizer stats move first, as PutEvent moves them on an edit, but before the write rather than
 * after it: a move that fails leaves the event as it was, and the next run finds it again. The other
 * way round the event would already name its new organizer, no run would look at it again, and the
 * counters would stay under the old key, which the nightly rebuild never touches. A move repeated after
 * a failed write finds no old row and returns at once.
 */
const writeMigratedEventRow = async (row: ReadRow<JsonDogEvent>): Promise<void> => {
  if (movesOrganizerStats(row)) await moveOrganizerEventStats(row.before, row.item)

  const { remove, set } = createPatch(row.item, row.before)
  await writeMigratedEvent(
    row.item.id,
    { ...(remove ? { remove } : {}), set: { ...set, updatedAt: new Date().toISOString() } },
    row.before.updatedAt
  )
}

/**
 * Writes the roles the migrations gave the user, on condition they are still the ones read, with the
 * bump that lets the user list's incremental fetch hand the row to clients that already cache it.
 */
const writeMigratedUserRow = async ({ before, item }: ReadRow<JsonUser>): Promise<void> => {
  await writeMigratedUserRoles(item.id, item.roles ?? {}, before.roles, new Date().toISOString())
}

/** How the runner reads a row again and writes it, for one table. */
interface MigratedTable<T> {
  label: string
  reread: (id: string) => Promise<T | undefined>
  write: (row: ReadRow<T>) => Promise<void>
}

const eventTable: MigratedTable<JsonDogEvent> = {
  label: 'Event',
  reread: (id) => readEvent(id, true),
  write: writeMigratedEventRow,
}

const userTable: MigratedTable<JsonUser> = {
  label: 'User',
  reread: (id) => readUser(id, true),
  write: writeMigratedUserRow,
}

/**
 * Writes the row. One changed by someone else since it was read is read again and migrated afresh, up
 * to MAX_WRITE_ATTEMPTS writes. Returns the row as finally written, nothing when the row is gone or
 * needs nothing any more.
 */
const writeRow = <T extends { id: string }>(
  table: MigratedTable<T>,
  row: ReadRow<T>,
  pending: Pending<T>[],
  context: MigrationContext
): Promise<ReadRow<T> | undefined> =>
  retryOnConditionFailure<ReadRow<T> | undefined, ReadRow<T> | undefined>({
    exhausted: () => new LambdaError(409, `${table.label} ${row.item.id} kept changing while it was migrated`),
    initial: row,
    maxAttempts: MAX_WRITE_ATTEMPTS,
    reread: async () => {
      const fresh = await table.reread(row.item.id)
      return fresh && migrateRow(fresh, pending, context)
    },
    // A row deleted meanwhile, or already migrated by the other writer, needs nothing any more.
    work: async (current) => {
      if (!current?.changed.some(Boolean)) return undefined
      await table.write(current)
      return current
    },
  })

interface MigrationResult {
  count: number
  name: string
  skipped?: { count: number; ids: string[] }
}

/** A result with the reasons for its skipped rows, which go to the log but not into the answer. */
type MigrationOutcome = MigrationResult & { detail?: SkippedRows['detail'] }

const outcomeOf = <T>(
  migration: Migration<T>,
  count: number,
  rows: T[],
  context: MigrationContext
): MigrationOutcome => {
  const skipped = migration.skipped?.(rows, context)
  if (!skipped?.ids.length) return { count, name: migration.name }
  return {
    count,
    detail: skipped.detail,
    name: migration.name,
    skipped: { count: skipped.ids.length, ids: skipped.ids },
  }
}

/**
 * Runs the pending migrations of one table over its rows and writes the changed ones. After a failed
 * write no further row is started (mapWithConcurrency stops there), and the run answers with the
 * failure only once the rows already being written have finished. A half-done run is safe because
 * every migration can be run again.
 *
 * Each row is added to `written` as its write lands, so the caller still knows which rows changed
 * when a later write fails and this throws.
 */
const migrateTable = async <T extends { id: string }>(
  table: MigratedTable<T>,
  rows: T[],
  pending: Pending<T>[],
  context: MigrationContext,
  written: ReadRow<T>[] = []
): Promise<MigrationOutcome[]> => {
  // As read, for the skip reports: the migrations change the rows in place.
  const asRead = structuredClone(rows)
  const modifiedRows = rows
    .map((item) => migrateRow(item, pending, context))
    .filter(({ changed }) => changed.some(Boolean))
  await mapWithConcurrency(modifiedRows, WRITE_CONCURRENCY, async (row) => {
    const landed = await writeRow(table, row, pending, context)
    if (landed) written.push(landed)
  })

  return pending.map(({ migration }, index) =>
    outcomeOf(migration, written.filter(({ changed }) => changed[index]).length, asRead, context)
  )
}

/**
 * Runs the user migrations. The users whose roles were written move between cached user lists, so
 * their scopes get one version bump, also when a later write fails and the run throws: a rerun leaves
 * the rows already written alone and would never bump them.
 */
const migrateUsers = async (pending: Pending<JsonUser>[], context: MigrationContext) => {
  if (!pending.length) return []

  const written: ReadRow<JsonUser>[] = []
  try {
    return await migrateTable(userTable, await readAllUsers(), pending, context, written)
  } finally {
    if (written.length) await bumpDataVersion('users', changedUserScopes(written))
  }
}

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

/** The cached user lists a role change moves a user between, which have to be fetched again. */
const changedUserScopes = (rows: ReadRow<JsonUser>[]) => [
  ...new Set(rows.flatMap(({ before, item }) => [...userScopes(before), ...userScopes(item)])),
]

const isPending =
  (applied: Map<string, string | undefined>) =>
  <T>({ hash, migration }: Pending<T>) =>
    applied.get(migration.name) !== hash

/**
 * The admin button (API Gateway) is a forced full run, so a correction run is always possible. The
 * deploy invokes the function directly and only the migrations the registry does not list as
 * applied with the same code hash run, which makes a deploy without new migrations one registry
 * read and no table scan.
 */
const runMigrationLambda = lambda('runMigration', async (event) => {
  const direct = isDirectInvoke(event)
  if (!direct) await authorizeAdmin(event)

  const applied = direct ? await readAppliedMigrations(migrationNames) : new Map<string, string | undefined>()
  const pendingEvents = registeredEventMigrations.filter(isPending(applied))
  const pendingUsers = registeredUserMigrations.filter(isPending(applied))

  if (!pendingEvents.length && !pendingUsers.length) {
    logger.info('no migrations pending')
    return response(200, [], event)
  }

  const events = await readAllEvents()
  const context = await readMigrationContext(events)

  // The users first: their roles are mapped from the events as read, so a run that fails after them
  // still finds the orphan events, and the mapping, the next time. The events first would leave none.
  const userOutcomes = await migrateUsers(pendingUsers, context)
  const eventOutcomes = await migrateTable(eventTable, events, pendingEvents, context)

  const outcomes = [...eventOutcomes, ...userOutcomes]
  const hashes = [...pendingEvents, ...pendingUsers].map(({ hash }) => hash)

  // Only after every write went through: a failed run records nothing and the next one starts over.
  // The rows a migration left alone are reported, not retried: a rerun would leave the same rows.
  await Promise.all(outcomes.map(({ count, name }, index) => markMigrationApplied(name, count, hashes[index])))

  const skipped = outcomes.filter((outcome) => outcome.skipped)
  if (skipped.length) {
    logger.warn('migrations left rows as they were', {
      skipped: skipped.map(({ detail, name, skipped: rows }) => ({ detail, name, ...rows })),
    })
  }
  const migrationResults: MigrationResult[] = outcomes.map(({ detail: _detail, ...result }) => result)
  logger.info('migrations applied', { migrations: migrationResults })

  return response(200, migrationResults, event)
})

export default runMigrationLambda
