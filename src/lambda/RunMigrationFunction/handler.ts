import type { JsonDogEvent, RegistrationClass } from '../../types'
import { getEventSeason } from '../../lib/event'
import { CONFIG } from '../config'
import { authorizeAdmin } from '../lib/auth'
import { lambda, response } from '../lib/lambda'
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

const runMigrationLambda = lambda('runMigration', async (event) => {
  const { res } = await authorizeAdmin(event)
  if (res) return res

  const events = (await dynamoDB.readAll<JsonDogEvent>()) ?? []

  const migrationResults = migrations.map((migration) => ({ count: 0, name: migration.name }))
  const modifiedEvents = new Set<JsonDogEvent>()

  for (const item of events) {
    migrations.forEach((migration, index) => {
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

  return response(
    200,
    migrationResults.map(({ count, name }) => ({
      count,
      name,
    })),
    event
  )
})

export default runMigrationLambda
