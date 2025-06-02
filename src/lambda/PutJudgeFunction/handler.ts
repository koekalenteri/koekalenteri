import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { lambda } from '../lib/lambda'
import { response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { createDbRecord } from '../utils/proxyEvent'

export const dynamoDB = new CustomDynamoClient(CONFIG.judgeTable)

const putJudgeLambda = lambda('putJudge', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }
  const timestamp = new Date().toISOString()

  const item = createDbRecord(event, timestamp, user.name)
  await dynamoDB.write(item)

  return response(200, item, event)
})

export default putJudgeLambda
