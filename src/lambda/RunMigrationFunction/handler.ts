import type { JsonDogEvent, RegistrationClass } from '../../types'
import { createHash } from 'node:crypto'
import { getEventSeason } from '../../lib/event'
import { mapWithConcurrency } from '../../lib/utils'
import { CONFIG } from '../config'
import { isConditionalCheckFailure } from '../lib/api-gw'
import { authorizeAdmin } from '../lib/auth'
import { markMigrationApplied, readAppliedMigrations } from '../lib/dataVersions'
import { isDirectInvoke, LambdaError, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { createPatch } from '../lib/patch'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

type EventMigration = {
  name: string
  run: (event: JsonDogEvent) => boolean
}

const migrations: EventMigration[] = [
  {
    // Rows that predate updatedAt get one; the shared bump below writes the actual value.
    name: 'populateUpdatedAt',
    run: (event) => event.updatedAt === undefined,
  },
  {
    // `gsiOrganizerStartDate` is keyed on a top-level copy of organizer.id; rows written before
    // the copy existed are not in the index until they carry it (KOE-1341).
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
]

/**
 * Identifies the code of a migration. The text is the bundled function, so a change of the build can
 * alter it without a source change (the migration then reruns once, which is harmless) and a change
 * inside a helper the migration calls does not alter it (that migration needs a new name).
 */
const hashOf = ({ run }: EventMigration) => createHash('sha256').update(run.toString()).digest('hex').slice(0, 16)

const registered = migrations.map((migration) => ({ hash: hashOf(migration), migration }))

const MAX_WRITE_ATTEMPTS = 3

/** Rows are independent partitions; a modest fan-out keeps a large table well inside the timeout. */
const WRITE_CONCURRENCY = 5

type Pending = (typeof registered)[number]

/**
 * A row as read: a copy from before the migrations ran, to diff what they changed, and the
 * `updatedAt` it had then, which the migrations and the bump leave alone on the item but a writer
 * moving the row does not.
 */
type ReadRow = { before: JsonDogEvent; changed: boolean[]; item: JsonDogEvent; readUpdatedAt: string | undefined }

const migrateRow = (item: JsonDogEvent, pending: Pending[]): ReadRow => {
  const before = structuredClone(item)
  return { before, changed: pending.map(({ migration }) => migration.run(item)), item, readUpdatedAt: before.updatedAt }
}

/**
 * The write only lands on a row that still exists and that nobody moved since it was read. Without
 * the existence check an update of a deleted row would create a stub holding only the migrated fields.
 */
const existsAndUnchangedSince = (readUpdatedAt: string | undefined) => ({
  expression: `attribute_exists(#id) AND ${readUpdatedAt === undefined ? 'attribute_not_exists(#updatedAt)' : '#updatedAt = :read'}`,
  names: { '#id': 'id', '#updatedAt': 'updatedAt' },
  ...(readUpdatedAt === undefined ? {} : { values: { ':read': readUpdatedAt } }),
})

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
 * A row changed by someone else since it was read is read again and migrated afresh, up to
 * MAX_WRITE_ATTEMPTS writes. Returns what changed in the row that was finally written, nothing when
 * the row is gone or needs nothing any more.
 */
const writeRow = async (row: ReadRow, pending: Pending[], attempt = 1): Promise<boolean[]> => {
  if (!row.changed.some(Boolean)) return row.changed

  const { remove, set } = createPatch(row.item, row.before)
  try {
    await dynamoDB.update(
      { id: row.item.id },
      { ...(remove ? { remove } : {}), set: { ...set, updatedAt: new Date().toISOString() } },
      undefined,
      undefined,
      existsAndUnchangedSince(row.readUpdatedAt)
    )
    return row.changed
  } catch (error) {
    if (!isConditionalCheckFailure(error)) throw error
    if (attempt >= MAX_WRITE_ATTEMPTS) {
      throw new LambdaError(409, `Event ${row.item.id} kept changing while it was migrated`)
    }
    const fresh = await dynamoDB.read<JsonDogEvent>({ id: row.item.id }, undefined, true)
    if (!fresh) return pending.map(() => false)
    return writeRow(migrateRow(fresh, pending), pending, attempt + 1)
  }
}

/**
 * The admin button (API Gateway) is a forced full run, so a correction run is always possible. The
 * deploy invokes the function directly and only the migrations the registry does not list as
 * applied with the same code hash run, which makes a deploy without new migrations one registry
 * read and no table scan.
 */
const runMigrationLambda = lambda('runMigration', async (event) => {
  const direct = isDirectInvoke(event)
  if (!direct) await authorizeAdmin(event)

  const applied = direct
    ? await readAppliedMigrations(migrations.map(({ name }) => name))
    : new Map<string, string | undefined>()
  const pending = registered.filter(({ hash, migration }) => applied.get(migration.name) !== hash)

  if (!pending.length) {
    logger.info('no migrations pending')
    return response(200, [], event)
  }

  const events = (await dynamoDB.readAll<JsonDogEvent>()) ?? []
  const modifiedRows = events.map((item) => migrateRow(item, pending)).filter(({ changed }) => changed.some(Boolean))

  const written = await mapWithConcurrency(modifiedRows, WRITE_CONCURRENCY, (row) => writeRow(row, pending))
  const counts = pending.map((_, index) => written.filter((changed) => changed[index]).length)

  const migrationResults = pending.map(({ migration }, index) => ({ count: counts[index], name: migration.name }))

  // Only after every write went through: a failed run records nothing and the next one starts over.
  await Promise.all(
    pending.map(({ hash }, index) => markMigrationApplied(migrationResults[index].name, counts[index], hash))
  )
  logger.info('migrations applied', { migrations: migrationResults })

  return response(200, migrationResults, event)
})

export default runMigrationLambda
