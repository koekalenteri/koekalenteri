import type { JsonDogEvent } from '../../types'
import { formatDate, TIME_ZONE } from '../../i18n/dates'
import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { lambda, response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const getSeasonFromStartDate = (startDate?: string): string =>
  formatDate(startDate ?? '', 'yyyy', { timeZone: TIME_ZONE })

type EventMigration = {
  name: string
  run: (event: JsonDogEvent) => boolean
}

const migrations: EventMigration[] = [
  {
    name: 'fixSeasonFromStartDate',
    run: (event) => {
      const season = getSeasonFromStartDate(event.startDate)

      if (!season || event.season === season) {
        return false
      }

      event.season = season
      return true
    },
  },
]

const runMigrationLambda = lambda('runMigration', async (event) => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

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
