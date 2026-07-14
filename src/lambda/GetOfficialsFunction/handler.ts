import type { EventType, JsonOfficial } from '../../types'
import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { collectionChangesSince, parseDateParam } from '../lib/incremental'
import KLAPI from '../lib/KLAPI'
import { lambda, response } from '../lib/lambda'
import { fetchOfficialsForEventTypes, updateOfficials } from '../lib/official'
import { getKLAPIConfig } from '../lib/secrets'
import { updateUsersFromOfficialsOrJudges } from '../lib/user'
import { publishAdminDataInvalidation } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { eventTypeTable, officialTable } = CONFIG
// exported for testing
export const dynamoDB = new CustomDynamoClient(officialTable)

const getOfficialsLambda = lambda('getOfficials', async (event) => {
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
    const officials = await fetchOfficialsForEventTypes(
      klapi,
      eventTypes.map((et) => et.eventType)
    )

    if (officials?.length) {
      await updateOfficials(dynamoDB, officials)
      await updateUsersFromOfficialsOrJudges(dynamoDB, officials, 'officer')
    }
    await publishAdminDataInvalidation(['officials', 'users'])
  }

  const items = (await dynamoDB.readAll<JsonOfficial>()) ?? []
  const since = parseDateParam(event.queryStringParameters?.since)

  return response(200, since ? collectionChangesSince(items, since) : items.filter((o) => !o.deletedAt), event)
})

export default getOfficialsLambda
