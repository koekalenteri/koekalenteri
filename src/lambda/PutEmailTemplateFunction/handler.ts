import type { EmailTemplateContent, JsonEmailTemplate } from '../../types'
import {
  CreateTemplateCommand,
  SESClient,
  TemplateDoesNotExistException,
  UpdateTemplateCommand,
} from '@aws-sdk/client-ses'
import { CONFIG } from '../config'
import { authorizeAdmin, getUsername } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { publishAdminDataInvalidation } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { markdownToTemplate } from '../utils/email/markdown'

const dynamoDB = new CustomDynamoClient(CONFIG.emailTemplateTable)
const ses = new SESClient()

const updateOrCreateTemplate = async (template: EmailTemplateContent) => {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const command = new UpdateTemplateCommand({ Template: template })
    await ses.send(command)
    logger.info('email template updated', { template: template.TemplateName })
  } catch (e) {
    if (e instanceof TemplateDoesNotExistException) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const command = new CreateTemplateCommand({ Template: template })
        await ses.send(command)
        logger.info('email template created', { template: template.TemplateName })
      } catch (createError) {
        logger.error('failed to create email template', { error: createError, template: template.TemplateName })
        throw createError
      }
    } else {
      logger.error('failed to update email template', { error: e, template: template.TemplateName })
      throw e
    }
  }
}

const putEmailTemplateLambda = lambda('putEmailTemplate', async (event) => {
  const { res } = await authorizeAdmin(event)
  if (res) return res

  const timestamp = new Date().toISOString()
  const username = await getUsername(event)

  const item: JsonEmailTemplate = parseJSONWithFallback(event.body)
  const existing = await dynamoDB.read<JsonEmailTemplate>({ id: item.id })

  // modification info is always updated
  item.modifiedAt = timestamp
  item.modifiedBy = username

  const data: JsonEmailTemplate = { ...existing, ...item }

  // Generate SES compatible template for all languages
  data.ses = {
    en: await markdownToTemplate(`${item.id}-${CONFIG.stackName}-en`, data.en),
    fi: await markdownToTemplate(`${item.id}-${CONFIG.stackName}-fi`, data.fi),
  }

  if (data.ses) {
    await updateOrCreateTemplate(data.ses.fi)
    await updateOrCreateTemplate(data.ses.en)
  }

  await dynamoDB.write(data)
  await publishAdminDataInvalidation(['emailTemplates'])

  return response(200, data, event)
})

export default putEmailTemplateLambda
