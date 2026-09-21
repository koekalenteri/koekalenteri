import type { EmailTemplateContent, JsonEmailTemplate, Language } from '../../types'
import {
  CreateTemplateCommand,
  InvalidTemplateException,
  SESClient,
  TemplateDoesNotExistException,
  UpdateTemplateCommand,
} from '@aws-sdk/client-ses'
import { explainTemplateRejection, findEmailTemplateError } from '../../lib/emailTemplate'
import { CONFIG } from '../config'
import { authorizeAdmin, getUsername } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { httpError, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { publishAdminDataInvalidation } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { markdownToTemplate } from '../utils/email/markdown'

const dynamoDB = new CustomDynamoClient(CONFIG.emailTemplateTable)
const ses = new SESClient()

/**
 * SES refusing the template's content is the author's to fix, so it goes back as a 400 that names
 * the language. SES itself only says "Handlebars compilation failed for input Template Content";
 * compiling the parts here usually has a better word for it (KOE-1434). Anything else is ours and
 * is thrown on as it came.
 */
const rejection = (language: Language, template: EmailTemplateContent, e: unknown, message: string): unknown => {
  if (e instanceof InvalidTemplateException) {
    const explanation = explainTemplateRejection(template) ?? e.message
    logger.info('email template rejected by SES', { explanation, language, template: template.TemplateName })
    return httpError(400, { language, message: explanation })
  }
  logger.error(message, { error: e, template: template.TemplateName })
  return e
}

const updateOrCreateTemplate = async (language: Language, template: EmailTemplateContent) => {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const command = new UpdateTemplateCommand({ Template: template })
    await ses.send(command)
    logger.info('email template updated', { template: template.TemplateName })
  } catch (e) {
    if (!(e instanceof TemplateDoesNotExistException)) {
      throw rejection(language, template, e, 'failed to update email template')
    }
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const command = new CreateTemplateCommand({ Template: template })
      await ses.send(command)
      logger.info('email template created', { template: template.TemplateName })
    } catch (createError) {
      throw rejection(language, template, createError, 'failed to create email template')
    }
  }
}

const putEmailTemplateLambda = lambda('putEmailTemplate', async (event) => {
  await authorizeAdmin(event)

  const timestamp = new Date().toISOString()
  const username = await getUsername(event)

  const item: JsonEmailTemplate = parseJSONWithFallback(event.body)
  const existing = await dynamoDB.read<JsonEmailTemplate>({ id: item.id })

  // modification info is always updated
  item.modifiedAt = timestamp
  item.modifiedBy = username

  const data: JsonEmailTemplate = { ...existing, ...item }

  // Both sources are checked before either reaches SES, so a broken English template never leaves
  // the Finnish one updated there and the table untouched.
  const syntaxError = findEmailTemplateError(data)
  if (syntaxError) throw httpError(400, syntaxError)

  // Generate SES compatible template for all languages
  data.ses = {
    en: await markdownToTemplate(`${item.id}-${CONFIG.stackName}-en`, data.en),
    fi: await markdownToTemplate(`${item.id}-${CONFIG.stackName}-fi`, data.fi),
  }

  if (data.ses) {
    await updateOrCreateTemplate('fi', data.ses.fi)
    await updateOrCreateTemplate('en', data.ses.en)
  }

  await dynamoDB.write(data)
  await publishAdminDataInvalidation(['emailTemplates'])

  return response(200, data, event)
})

export default putEmailTemplateLambda
