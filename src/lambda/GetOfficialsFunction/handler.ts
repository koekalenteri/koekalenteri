import { authorize } from '../auth/api'
import { eventTypeRepository } from '../eventType/repository'
import KLAPI from '../lib/KLAPI'
import { lambda, response } from '../lib/lambda'
import { fetchOfficialsForEventTypes, updateOfficials } from '../lib/official'
import { getKLAPIConfig } from '../lib/secrets'
import { updateUsersFromOfficialsOrJudges } from '../lib/user'
import { officialRepository } from '../official/repository'
import { userRepository } from '../user/repository'

export const getOfficialsLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
    if (!user?.admin) {
      return response(401, 'Unauthorized', event)
    }

    const klapi = new KLAPI(getKLAPIConfig)
    const allEventTypes = await eventTypeRepository.list()
    const eventTypes = allEventTypes?.filter((et) => et.official && et.active) || []
    const officials = await fetchOfficialsForEventTypes(
      klapi,
      eventTypes.map((et) => et.eventType)
    )

    if (officials?.length) {
      await updateOfficials(officialRepository, officials)
      await updateUsersFromOfficialsOrJudges(userRepository, officials, 'officer')
    }
  }

  const items = (await officialRepository.list())?.filter((o) => !o.deletedAt) ?? []

  return response(200, items, event)
}

export default lambda('getOfficials', getOfficialsLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
