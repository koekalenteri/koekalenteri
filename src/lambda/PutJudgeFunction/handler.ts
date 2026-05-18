import { authorize } from '../auth/api'
import { CONFIG } from '../config'
import { lambda, response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { createDbRecord } from '../utils/proxyEvent'

export const dynamoDB = new CustomDynamoClient(CONFIG.judgeTable)

export const putJudgeLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }
  const timestamp = new Date().toISOString()

  const item = createDbRecord(event, timestamp, user.name)
  await dynamoDB.write(item)

  return response(200, item, event)
}

export default lambda('putJudge', putJudgeLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
