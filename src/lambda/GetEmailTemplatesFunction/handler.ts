import { authorizeWithMemberOf } from '../lib/auth'
import { collectionChangesSince, parseDateParam } from '../lib/incremental'
import { lambda, response } from '../lib/lambda'
import { readEmailTemplates } from '../lib/repositories/emailTemplateRepository'

const getEmailTemplatesLambda = lambda('getEmailTemplates', async (event) => {
  await authorizeWithMemberOf(event)

  const items = await readEmailTemplates()
  const since = parseDateParam(event.queryStringParameters?.since)

  return response(200, since ? collectionChangesSince(items ?? [], since) : items, event)
})

export default getEmailTemplatesLambda
