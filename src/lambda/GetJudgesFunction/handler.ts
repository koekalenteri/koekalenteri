import type { EventType, JsonJudge } from '../../types'

import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { fetchJudgesForEventTypes, updateJudges } from '../lib/judge'
import KLAPI from '../lib/KLAPI'
import { lambda } from '../lib/lambda'
import { getKLAPIConfig } from '../lib/secrets'
import { updateUsersFromOfficialsOrJudges } from '../lib/user'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { response } from '../utils/response'

const { eventTypeTable, judgeTable } = CONFIG
// exported for testing
export const dynamoDB = new CustomDynamoClient(judgeTable)

const getJudgesLambda = lambda('getJudges', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
    if (!user?.admin) {
      return response(401, 'Unauthorized', event)
    }

    const klapi = new KLAPI(getKLAPIConfig)
    const allEventTypes = await dynamoDB.readAll<EventType>(eventTypeTable)
    const eventTypes = allEventTypes?.filter((et) => et.official && et.active) || []
    const judges = await fetchJudgesForEventTypes(
      klapi,
      eventTypes.map((et) => et.eventType)
    )

    if (judges?.length) {
      await updateJudges(dynamoDB, judges)
      await updateUsersFromOfficialsOrJudges(dynamoDB, judges, 'judge')
    }
  }

  const items = (await dynamoDB.readAll<JsonJudge>())?.filter((j) => !j.deletedAt) ?? []

  return response(200, items, event)
})

export default getJudgesLambda
