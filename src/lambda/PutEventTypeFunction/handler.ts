import type { JsonEventType, JsonJudge, JsonOfficial } from '../../types'
import { authorize } from '../auth/api'
import { CONFIG } from '../config'
import { eventTypeRepository } from '../eventType/repository'
import { judgeRepository } from '../judge/repository'
import { lambda, response } from '../lib/lambda'
import { officialRepository } from '../official/repository'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { createDbRecord } from '../utils/proxyEvent'

const { eventTypeTable, judgeTable, officialTable } = CONFIG
const _dynamoDB = new CustomDynamoClient(eventTypeTable)

export const putEventTypeLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

  const timestamp = new Date().toISOString()

  const item = createDbRecord<JsonEventType>(event, timestamp, user.name, false)
  await eventTypeRepository.write(item)

  if (!item.active) {
    const active = (await eventTypeRepository.list())?.filter((et) => et.active) || []

    const judgesToRemove =
      (await judgeRepository.list())?.filter(
        (j) => !j.deletedAt && !active.some((et) => j.eventTypes?.includes(et.eventType))
      ) || []

    for (const judge of judgesToRemove) {
      await judgeRepository.write({
        ...judge,
        deletedAt: timestamp,
        deletedBy: user.name,
      } as JsonJudge)
    }

    const officialsToRemove =
      (await officialRepository.list())?.filter(
        (o) => !o.deletedAt && !active.some((et) => o.eventTypes?.includes(et.eventType))
      ) || []

    for (const official of officialsToRemove) {
      await officialRepository.write({
        ...official,
        deletedAt: timestamp,
        deletedBy: user.name,
      } as JsonOfficial)
    }
  }

  return response(200, item, event)
}

export default lambda('putEventType', putEventTypeLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
