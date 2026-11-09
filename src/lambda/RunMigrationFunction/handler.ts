import type { DayRekeying } from '../../lib/storedDays'
import type { ClassKey, JsonDog, JsonDogEvent, JsonRegistration, JsonUser } from '../../types'
import type { OrganizerRepoints } from './organizerRepoints'
import { createHash } from 'node:crypto'
import { getEventSeason } from '../../lib/event'
import { scoresAtPosts } from '../../lib/liveFormat'
import { getRegistrationOwners, resolveOwnerPerson } from '../../lib/registration'
import { formatEventResult, parseEventResultCode } from '../../lib/results'
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
import { readOrganizersIncludingDeleted } from '../lib/repositories/organizerRepository'
import {
  readEventRegistrations,
  readRegistration,
  readRegistrationEventIds,
  writeMigratedRegistration,
} from '../lib/repositories/registrationRepository'
import { readAllUsers, readUser, writeMigratedUserRoles } from '../lib/repositories/userRepository'
import { userScopes } from '../lib/user'
import { auditRederivedResults, restoreFirstPrize } from './firstPrizes'
import { findOrganizerRepoints, repointRoles, unmappableRoleIds } from './organizerRepoints'
import { storeScoresByExercise } from './scoreAddresses'

/**
 * What a migration did to a row: whether it changed it, or, for one that also reports what it could
 * not read, both.
 */
type MigrationOutcome = boolean | DayRekeying

/** What a run reads once, before any row, for the migrations that need more than the row itself. */
interface MigrationContext {
  organizerRepoints: OrganizerRepoints
  /** The events by id, read when a pending migration needs a row's event (`needsEvents`). */
  events: ReadonlyMap<string, JsonDogEvent>
}

/**
 * The rows a migration left as they were, or the values it could not place and took out of them, for
 * someone to look at, and why. The release log is the only record of them: a run that has recorded the
 * migration does not report them again.
 */
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
  /** Whether `run` reads the row's event from the context. */
  needsEvents?: boolean
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
        const perClass: Partial<Record<ClassKey, boolean>> = {}
        let allPublished = true
        for (const [eventClass, published] of Object.entries(list)) {
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

type StoredPerson = { email?: string; name?: string }

const comparable = (text: string | undefined): string | undefined => {
  const folded = text?.trim().toLocaleLowerCase('fi')
  if (!folded) return undefined
  return folded
}

/** Whether a stored handler or payer names a person, and one the first owner is not. */
const namesAnotherPerson = (person: StoredPerson | undefined, owner: StoredPerson | undefined): boolean => {
  const name = comparable(person?.name)
  const email = comparable(person?.email)
  if (!name && !email) return false
  return (!!name && name !== comparable(owner?.name)) || (!!email && email !== comparable(owner?.email))
}

/**
 * The selection a registration stored without one meant: `false` when it holds a separate person of
 * its own, so that person stays the handler or payer, and the (first) owner otherwise.
 */
const storedOwnerSelection = (registration: JsonRegistration, person: StoredPerson | undefined): boolean =>
  !namesAnotherPerson(person, getRegistrationOwners(registration)[0])

/** The owner a selection names, as `applyOwnerOverrides` persists it, or nothing for someone else. */
const mirroredOwner = (registration: JsonRegistration, selection: boolean) =>
  resolveOwnerPerson(registration.owners, registration.owner, selection)

/**
 * A stored copy of the owner as handler that held a membership the owner lacks hands it on to the
 * owner: an unset selection counted the handler's membership, and the row was priced by it. A payer's
 * membership was never read, so none is carried from the payer.
 */
const carryHandlerMembership = (registration: JsonRegistration) => {
  const owner = getRegistrationOwners(registration)[0]
  if (owner && !owner.membership && registration.handler?.membership === true) owner.membership = true
}

/** A row with a registration in it, not one holding only an email's delivery status. */
const isRegistrationContent = (registration: JsonRegistration) =>
  Boolean(registration.dog || registration.owner || registration.owners)

const registrationMigrations: Migration<JsonRegistration>[] = [
  {
    // KOE-1547: the entry's days, its group's and its frozen start group's (and the starts' keys
    // that name the day), and the dog's birth date and results' days, as keys.
    name: 'storeRegistrationDaysAsKeys',
    run: (registration) =>
      rekeyRegistrationDays(registration, { dogDay: legacyDecoder('dog'), eventDay: legacyDecoder('event') }),
  },
  {
    // KOE-1598: a registration stored without `ownerHandles`/`ownerPays` gets the one it meant, so
    // a save no longer mirrors the owner over a separate handler or payer, and an unchanged save stays
    // a 304. A separate person of its own on the row is someone else (`false`), otherwise the owner.
    // The owner is mirrored into the handler or payer it selects, as a save would, since the email,
    // the payment and the stats read the stored person; a membership the handler copy held stays.
    name: 'storeOwnerSelections',
    run: (registration) => {
      if (!isRegistrationContent(registration)) return false
      let changed = false
      if (registration.ownerHandles === undefined) {
        registration.ownerHandles = storedOwnerSelection(registration, registration.handler)
        if (registration.ownerHandles) carryHandlerMembership(registration)
        const handler = mirroredOwner(registration, registration.ownerHandles)
        if (handler) registration.handler = handler
        changed = true
      }
      if (registration.ownerPays === undefined) {
        registration.ownerPays = storedOwnerSelection(registration, registration.payer)
        const payer = mirroredOwner(registration, registration.ownerPays)
        if (payer) registration.payer = payer
        changed = true
      }
      return changed
    },
  },
  {
    // KOE-1665: a score stored at its post and its place there becomes its exercise and part, read
    // through the dog's round of the event's stored layout, and a stop or an elimination stored by post
    // alone becomes the last exercise at that post (`storeScoresByExercise`). A score the layout cannot
    // place is removed and logged with its values and the dog's class and number, so it can be entered
    // again. That log is the only record of a removed value: a forced rerun finds nothing to report.
    // The rule's version is the literal argument: a correction bumps it, and so reruns this.
    name: 'storeScoresByExercise',
    needsEvents: true,
    run: (registration, { events }) => storeScoresByExercise(registration, events.get(registration.eventId), 1).changed,
    // A migration answers only whether it changed a row, and its skips are read off the rows as read, so
    // the rows are converted again here, on copies, for what could not be placed.
    skipped: (registrations, { events }) => {
      const detail = registrations.flatMap(
        (registration) =>
          storeScoresByExercise(structuredClone(registration), events.get(registration.eventId), 1).unplaced
      )
      return {
        detail,
        ids: [...new Set(detail.map(({ eventId, registrationId }) => `${eventId}/${registrationId}`))],
      }
    },
  },
  {
    // KOE-1677: a working test result stored as a second prize because a task fell under half its points,
    // a floor the rules in force do not have, gets the first prize its percentage earns, with its totals.
    // The start list and the Omakoira send read the stored result, so both pick the correction up; the
    // registration's audit trail records the result before and after (`auditRederivedResults`).
    name: 'restoreFirstPrizes',
    needsEvents: true,
    run: (registration, { events }) => restoreFirstPrize(registration, events.get(registration.eventId)),
  },
  {
    // KOE-1678: §5.3.4 has one noudon epäonnistuminen, which the zero faults stored as two codes. A score
    // given either is stored with the one code; nothing else of the result changes.
    name: 'storeFailedRetrieve',
    run: (registration) => {
      let changed = false
      for (const task of registration.eventResult?.tasks ?? []) {
        if (task.zeroFault && SPLIT_RETRIEVE_FAULTS.has(task.zeroFault)) {
          task.zeroFault = 'failedRetrieve'
          changed = true
        }
      }
      return changed
    },
  },
  {
    // KOE-1678: §5.4.1 gives a working test round an elimination ended the nought, where it was stored as
    // the dash. A new version of the result, so a dog sent to Omakoira with the dash reads as changed and is
    // sent again; the registration's trail records the result before and after (`auditRederivedResults`).
    name: 'storeEliminationsAsNought',
    run: (registration) => {
      const stored = registration.eventResult
      if (!stored?.elimination || !scoresAtPosts(registration.eventType)) return false
      const eventClass = registration.class ?? undefined
      if (parseEventResultCode(stored.result, registration.eventType, eventClass) !== '-') return false
      stored.result = formatEventResult('0', registration.eventType, eventClass)
      stored.updatedAt = new Date().toISOString()
      return true
    },
  },
  {
    // KOE-1709: a zero whose reason is not known has no code. A score stored with the old `unknown` loses it;
    // nothing else of the result changes, so its version and the task's stamp stay as they were.
    name: 'removeUnknownZeroFault',
    run: (registration) => {
      let changed = false
      for (const task of registration.eventResult?.tasks ?? []) {
        if (task.zeroFault && REMOVED_ZERO_FAULTS.has(task.zeroFault)) {
          delete task.zeroFault
          changed = true
        }
      }
      return changed
    },
  },
]

/**
 * The zero-fault code `removeUnknownZeroFault` removes. Strings rather than `NowtZeroFault`, which no longer has it.
 */
const REMOVED_ZERO_FAULTS: ReadonlySet<string> = new Set(['unknown'])

/**
 * The zero-fault codes a failed retrieve was split into before KOE-1678, read only by `storeFailedRetrieve`.
 * Strings rather than `NowtZeroFault`, which no longer has them.
 */
const SPLIT_RETRIEVE_FAULTS: ReadonlySet<string> = new Set(['abandonedRetrieve', 'dummyNotFound'])

const dogMigrations: Migration<JsonDog>[] = [
  {
    // KOE-1547: the birth date and the results' days of the dogs the Kennel Club lookup stored.
    name: 'storeDogDaysAsKeys',
    run: (dog) => rekeyDogDays(dog, legacyDecoder('dog')),
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
 * other field as read, and the workflow locks (the registration group lock) move fields without
 * touching `updatedAt`, so the condition could not see them and the Put would undo them.
 */
const bumpedChanges = <T extends object>(row: ReadRow<T>) => {
  const { remove, set } = createPatch(row.item, row.before)
  return { ...(remove ? { remove } : {}), set: { ...set, updatedAt: new Date().toISOString() } }
}

/** The event table, over the events the run read once for its context. */
const eventTable = (events: JsonDogEvent[]): MigratedTable<JsonDogEvent> => ({
  id: (event) => event.id,
  loaders: () => Promise.resolve([() => Promise.resolve(events)]),
  migrations: eventMigrations,
  name: 'event',
  reread: ({ item }) => readEvent(item.id, true),
  write: (row) => writeMigratedEvent(row.item.id, bumpedChanges(row), row.before.updatedAt),
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
  // A result the migrations changed is recorded on the registration's trail, also when a later write fails.
  afterWrites: auditRederivedResults,
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

const MAX_WRITE_ATTEMPTS = 3

/** Rows are independent partitions; a modest fan-out keeps a large table well inside the timeout. */
const WRITE_CONCURRENCY = 5

/**
 * Writes a migrated row. A row changed by someone else since it was read is read again and migrated
 * afresh, up to MAX_WRITE_ATTEMPTS. Returns what the migrations
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
    maxAttempts: MAX_WRITE_ATTEMPTS,
    reread: async () => {
      const fresh = await table.reread(row)
      return fresh && migrateRow(fresh, pending, run.context)
    },
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

const allMigrationNames = [eventMigrations, userMigrations, registrationMigrations, dogMigrations].flatMap(
  (migrations: Migration<never>[]) => migrations.map(({ name }) => name)
)

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

/** Whether a table's pending migrations read the rows' events. */
const readsEvents = <T>(pending: Pending<T>[] | undefined) =>
  Boolean(pending?.some(({ migration }) => migration.needsEvents))

/**
 * Reads what the organizer repoint decides from, once per run. A table with no live organizer would
 * leave every event an orphan with nothing to match, and recording the migration then would keep it
 * from running once the table is filled, so the run fails instead, unless no event names an organizer.
 */
const readOrganizerRepoints = async (events: JsonDogEvent[]): Promise<OrganizerRepoints> => {
  const organizers = await readOrganizersIncludingDeleted()
  if (events.some(({ organizer }) => organizer?.id) && organizers.every(({ deletedAt }) => deletedAt)) {
    throw new LambdaError(500, 'The organizer table holds no live organizer; refresh it before migrating')
  }
  return findOrganizerRepoints(events, organizers)
}

/** The run's tables in the order they are migrated, with the events read once when either needs them. */
const pendingRuns = async (applied: Map<string, string | undefined>) => {
  const pendingEvents = pendingOf(eventTable([]), applied)
  const pendingUsers = pendingOf(userTable, applied)
  const pendingRegistrations = pendingOf(registrationTable, applied)
  const repoints = Boolean(pendingEvents || pendingUsers)
  const readEvents = repoints || readsEvents(pendingRegistrations)
  const events = readEvents ? await readAllEvents(true) : []
  // The repoint decides from the live events, as before the day migrations read the deleted ones too:
  // a deleted event's name must not split an orphan id's match. A deleted event on a matched id moves
  // with the live ones; one on an id with no live event stays as it is, unreported.
  const live = events.filter(({ deletedAt }) => !deletedAt)
  const context: MigrationContext = {
    events: new Map(events.map((item) => [item.id, item])),
    organizerRepoints: repoints ? await readOrganizerRepoints(live) : NO_REPOINTS,
  }
  // The users first: their roles are mapped from the events as read, so a run that fails after them
  // still finds the orphan events, and the mapping, the next time. The events first would leave none.
  const runs = [
    pendingUsers && tableRun(userTable, pendingUsers),
    pendingEvents && tableRun(eventTable(events), pendingEvents),
    pendingRegistrations && tableRun(registrationTable, pendingRegistrations),
    pendingRun(dogTable, applied),
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
    logger.warn('migrations skipped values they could not place or left rows as they were', {
      skipped: skipped.map(({ detail, name, skipped: rows }) => ({ detail, name, ...rows })),
    })
  }
  const migrationResults: MigrationResult[] = reports.map(({ detail: _detail, ...result }) => result)
  logger.info('migrations applied', { migrations: migrationResults })

  return response(200, migrationResults, event)
})

export default runMigrationLambda
