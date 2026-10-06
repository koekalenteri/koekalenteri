import type { JsonDogEvent, RegistrationClass } from '../../types'
import { getEventSeason } from '../../lib/event'
import { CONFIG } from '../config'
import { authorizeAdmin } from '../lib/auth'
import { markMigrationApplied, readAppliedMigrations } from '../lib/dataVersions'
import { isDirectInvoke, lambda, response } from '../lib/lambda'
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
 * The admin button (API Gateway) is a forced full run, so a correction run is always possible. The
 * deploy invokes the function directly and only the migrations the registry does not list as
 * applied run, which makes a deploy without new migrations one registry read and no table scan.
 */
const runMigrationLambda = lambda('runMigration', async (event) => {
  const direct = isDirectInvoke(event)
  if (!direct) await authorizeAdmin(event)

  const applied = direct ? await readAppliedMigrations(migrations.map(({ name }) => name)) : new Set<string>()
  const pending = migrations.filter(({ name }) => !applied.has(name))

  if (!pending.length) {
    logger.info('no migrations pending')
    return response(200, [], event)
  }

  const events = (await dynamoDB.readAll<JsonDogEvent>()) ?? []

  const migrationResults = pending.map((migration) => ({ count: 0, name: migration.name }))
  const modifiedEvents = new Set<JsonDogEvent>()

  for (const item of events) {
    pending.forEach((migration, index) => {
      if (migration.run(item)) {
        migrationResults[index].count++
        modifiedEvents.add(item)
      }
    })
  }

  // Every migration's change must reach browsers that already cache the event: the incremental
  // fetch (`changedSince` in lambda/lib/incremental.ts) reads `updatedAt`, and a row rewritten
  // without moving it comes back as unchanged, so the change would never reach anyone already
  // holding the event. `modifiedAt` stays untouched: it records a user's edit, which this is not.
  const updatedAt = new Date().toISOString()
  for (const item of modifiedEvents) {
    item.updatedAt = updatedAt
    await dynamoDB.write(item)
  }

  // Only after every write went through: a failed run records nothing and the next one starts over.
  await Promise.all(migrationResults.map(({ count, name }) => markMigrationApplied(name, count)))
  logger.info('migrations applied', { migrations: migrationResults })

  return response(200, migrationResults, event)
})

export default runMigrationLambda
