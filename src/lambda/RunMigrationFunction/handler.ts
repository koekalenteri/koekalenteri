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
    name: 'populateUpdatedAtFromModifiedAt',
    run: (event) => {
      if (event.updatedAt) {
        return false
      }

      const modifiedAt = event.modifiedAt
      if (typeof modifiedAt !== 'string' || Number.isNaN(new Date(modifiedAt).getTime())) {
        return false
      }

      event.updatedAt = modifiedAt
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

      // The browser keeps events in a persisted cache and refetches them incrementally, asking only
      // for what changed since its cursor (`changedSince` in lambda/lib/incremental.ts). A row
      // rewritten without moving a timestamp comes back as unchanged, so the new field would never
      // reach anyone already holding the event. `updatedAt` is the one to move: it is what the
      // incremental fetch reads, while `modifiedAt` records a user's edit and this is not one.
      event.updatedAt = new Date().toISOString()
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

  for (const item of modifiedEvents) {
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
