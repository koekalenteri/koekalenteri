import type { JsonDogEvent } from '../../types'
import { formatDate, TIME_ZONE } from '../../i18n/dates'
import { authorize } from '../auth/api'
import { eventRepository } from '../event/repository'
import { lambda, response } from '../lib/lambda'

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

export const runMigrationLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

  const events = (await eventRepository.listAll()) ?? []

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
    await eventRepository.save(item)
  }

  return response(
    200,
    migrationResults.map(({ count, name }) => ({
      count,
      name,
    })),
    event
  )
}

export default lambda('runMigration', runMigrationLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
