import { CONFIG } from '../config'
import { authorizeAdmin } from '../lib/auth'
import { lambda, response } from '../lib/lambda'
import { publishAdminDataInvalidation } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { createDbRecord } from '../utils/proxyEvent'

export const dynamoDB = new CustomDynamoClient(CONFIG.judgeTable)

const putJudgeLambda = lambda('putJudge', async (event) => {
  const { res, user } = await authorizeAdmin(event)
  if (res) return res
  const timestamp = new Date().toISOString()

  const item = createDbRecord(event, timestamp, user.name)
  await dynamoDB.write(item)
  await publishAdminDataInvalidation(['judges'])

  return response(200, item, event)
})

export default putJudgeLambda
