import type { EventType, JsonEventType, JsonJudge, JsonOfficial } from '../../types'
import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { lambda, response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { createDbRecord } from '../utils/proxyEvent'

const { eventTypeTable, judgeTable, officialTable } = CONFIG
const dynamoDB = new CustomDynamoClient(eventTypeTable)

const putEventTypeLambda = lambda('putEventType', async (event) => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

  const timestamp = new Date().toISOString()

  const item = createDbRecord<JsonEventType>(event, timestamp, user.name, false)
  await dynamoDB.write(item)

  if (!item.active) {
    const active = (await dynamoDB.readAll<EventType>())?.filter((et) => et.active) || []

    const judgesToRemove =
      (await dynamoDB.readAll<JsonJudge>(judgeTable))?.filter(
        (j) => !j.deletedAt && !active.some((et) => j.eventTypes?.includes(et.eventType))
      ) || []

    for (const judge of judgesToRemove) {
      await dynamoDB.write(
        {
          ...judge,
          deletedAt: timestamp,
          deletedBy: user.name,
        },
        judgeTable
      )
    }

    const officialsToRemove =
      (await dynamoDB.readAll<JsonOfficial>(officialTable))?.filter(
        (o) => !o.deletedAt && !active.some((et) => o.eventTypes?.includes(et.eventType))
      ) || []

    for (const official of officialsToRemove) {
      await dynamoDB.write(
        {
          ...official,
          deletedAt: timestamp,
          deletedBy: user.name,
        },
        officialTable
      )
    }
  }

  return response(200, item, event)
})

export default putEventTypeLambda
