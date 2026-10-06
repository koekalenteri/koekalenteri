import type { JsonDogEvent, RegistrationClass } from '../../types'
import { createHash } from 'node:crypto'
import { getEventSeason } from '../../lib/event'
import { CONFIG } from '../config'
import { isConditionalCheckFailure } from '../lib/api-gw'
import { authorizeAdmin } from '../lib/auth'
import { markMigrationApplied, readAppliedMigrations } from '../lib/dataVersions'
import { isDirectInvoke, LambdaError, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
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

type Pending = (typeof registered)[number]

/** A row as read, with the `updatedAt` it had then: the migrations and the bump change the item. */
type ReadRow = { changed: boolean[]; item: JsonDogEvent; readUpdatedAt: string | undefined }

const migrateRow = (item: JsonDogEvent, pending: Pending[]): ReadRow => ({
  changed: pending.map(({ migration }) => migration.run(item)),
  item,
  readUpdatedAt: item.updatedAt,
})

/** The write only lands when nobody changed the row since it was read. */
const unchangedSince = (readUpdatedAt: string | undefined) =>
  readUpdatedAt === undefined
    ? { expression: 'attribute_not_exists(updatedAt)' }
    : { expression: 'updatedAt = :read', values: { ':read': readUpdatedAt } }

/**
 * Every migration's change must reach browsers that already cache the event: the incremental fetch
 * (`changedSince` in lambda/lib/incremental.ts) reads `updatedAt`, and a row rewritten without moving
 * it comes back as unchanged, so the change would never reach anyone already holding the event.
 * `modifiedAt` stays untouched: it records a user's edit, which this is not.
 *
 * A row saved by someone else since it was read is read again and migrated afresh, so their change
 * survives. Returns what changed in the row that was finally written, none when nothing was left to do.
 */
const writeRow = async (row: ReadRow, pending: Pending[]): Promise<boolean[]> => {
  let current = row
  for (let attempt = 1; current.changed.some(Boolean); attempt++) {
    current.item.updatedAt = new Date().toISOString()
    try {
      await dynamoDB.write(current.item, undefined, unchangedSince(current.readUpdatedAt))
      return current.changed
    } catch (error) {
      if (!isConditionalCheckFailure(error)) throw error
      if (attempt >= MAX_WRITE_ATTEMPTS) {
        throw new LambdaError(409, `Event ${current.item.id} kept changing while it was migrated`)
      }
      const fresh = await dynamoDB.read<JsonDogEvent>({ id: current.item.id }, undefined, true)
      current = fresh ? migrateRow(fresh, pending) : { ...current, changed: pending.map(() => false) }
    }
  }
  return current.changed
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

  const counts = pending.map(() => 0)
  for (const row of modifiedRows) {
    const written = await writeRow(row, pending)
    written.forEach((changed, index) => {
      if (changed) counts[index]++
    })
  }

  const migrationResults = pending.map(({ migration }, index) => ({ count: counts[index], name: migration.name }))

  // Only after every write went through: a failed run records nothing and the next one starts over.
  await Promise.all(
    pending.map(({ hash }, index) => markMigrationApplied(migrationResults[index].name, counts[index], hash))
  )
  logger.info('migrations applied', { migrations: migrationResults })

  return response(200, migrationResults, event)
})

export default runMigrationLambda
