import { authorize } from '../auth/api'
import { CONFIG } from '../config'
import { eventTypeRepository } from '../eventType/repository'
import { judgeRepository } from '../judge/repository'
import { fetchJudgesForEventTypes, updateJudges } from '../lib/judge'
import KLAPI from '../lib/KLAPI'
import { lambda, response } from '../lib/lambda'
import { getKLAPIConfig } from '../lib/secrets'
import { updateUsersFromOfficialsOrJudges } from '../lib/user'
import { userRepository } from '../user/repository'

const { eventTypeTable } = CONFIG

export const getJudgesLambda = async (event: APIGatewayProxyEvent) => {
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
    const judges = await fetchJudgesForEventTypes(
      klapi,
      eventTypes.map((et) => et.eventType)
    )

    if (judges?.length) {
      await updateJudges(judgeRepository, judges)
      await updateUsersFromOfficialsOrJudges(userRepository, judges, 'judge')
    }
  }

  const items = (await judgeRepository.list())?.filter((j) => !j.deletedAt) ?? []

  return response(200, items, event)
}

export default lambda('getJudges', getJudgesLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
