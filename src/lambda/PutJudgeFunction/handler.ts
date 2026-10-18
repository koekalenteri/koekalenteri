import type { JsonJudge } from '../../types'
import { authorizeAdmin } from '../lib/auth'
import { lambda, response } from '../lib/lambda'
import { writeJudge } from '../lib/repositories/judgeRepository'
import { publishAdminDataInvalidation } from '../lib/ws/actions'
import { createDbRecord } from '../utils/proxyEvent'

const putJudgeLambda = lambda('putJudge', async (event) => {
  const user = await authorizeAdmin(event)
  const timestamp = new Date().toISOString()

  const item = createDbRecord<JsonJudge>(event, timestamp, user.name)
  await writeJudge(item)
  await publishAdminDataInvalidation(['judges'])

  return response(200, item, event)
})

export default putJudgeLambda
