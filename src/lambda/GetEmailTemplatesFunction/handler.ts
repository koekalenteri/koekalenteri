import { CONFIG } from '../config'
import { authorizeWithMemberOf } from '../lib/auth'
import { collectionChangesSince, parseDateParam } from '../lib/incremental'
import { lambda, response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.emailTemplateTable)

const getEmailTemplatesLambda = lambda('getEmailTemplates', async (event) => {
  const { res } = await authorizeWithMemberOf(event)
  if (res) return res

  const items = await dynamoDB.readAll()
  const since = parseDateParam(event.queryStringParameters?.since)

  return response(200, since ? collectionChangesSince(items ?? [], since) : items, event)
})

export default getEmailTemplatesLambda
