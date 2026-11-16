import type { JsonEmailTemplate } from '../../types'
import { authorizeAdmin, getUsername } from '../lib/auth'
import { putSesTemplates } from '../lib/emailTemplate'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { readEmailTemplate, writeEmailTemplate } from '../lib/repositories/emailTemplateRepository'
import { publishAdminDataInvalidation } from '../lib/ws/actions'

const putEmailTemplateLambda = lambda('putEmailTemplate', async (event) => {
  await authorizeAdmin(event)

  const timestamp = new Date().toISOString()
  const username = await getUsername(event)

  const item: JsonEmailTemplate = parseJSONWithFallback(event.body)
  const existing = await readEmailTemplate(item.id)

  // modification info is always updated, creation info only on the row's first save
  item.modifiedAt = timestamp
  item.modifiedBy = username

  const data: JsonEmailTemplate = existing
    ? { ...existing, ...item }
    : { ...item, createdAt: timestamp, createdBy: username }

  // Generate SES compatible template for all languages, after both sources are checked
  data.ses = await putSesTemplates(data)

  await writeEmailTemplate(data)
  await publishAdminDataInvalidation(['emailTemplates'])

  return response(200, data, event)
})

export default putEmailTemplateLambda
