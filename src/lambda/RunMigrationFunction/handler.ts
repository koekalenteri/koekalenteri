import type { JsonDogEvent } from '../../types'
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
