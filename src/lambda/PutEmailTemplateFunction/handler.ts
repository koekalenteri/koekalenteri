import type { Template } from '@aws-sdk/client-ses'
import type { JsonEmailTemplate } from '../../types'

import {
  CreateTemplateCommand,
  SESClient,
  TemplateDoesNotExistException,
  UpdateTemplateCommand,
} from '@aws-sdk/client-ses'

import { CONFIG } from '../config'
import { authorize, getUsername } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { markdownToTemplate } from '../utils/email/markdown'

const dynamoDB = new CustomDynamoClient(CONFIG.emailTemplateTable)
const ses = new SESClient()

const updateOrCreateTemplate = async (template: Template) => {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const command = new UpdateTemplateCommand({ Template: template })
    const res = await ses.send(command)
    console.info(res)
  } catch (e) {
    if (e instanceof TemplateDoesNotExistException) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const command = new CreateTemplateCommand({ Template: template })
      const res = await ses.send(command)
      console.info(res)
    } else {
      console.error(e)
      throw e
    }
  }
}

const putEmailTemplateLambda = lambda('putEmailTemplate', async (event) => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

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
    fi: await markdownToTemplate(`${item.id}-${CONFIG.stackName}-fi`, data.fi),
    en: await markdownToTemplate(`${item.id}-${CONFIG.stackName}-en`, data.en),
  }

  if (data.ses) {
    await updateOrCreateTemplate(data.ses.fi)
    await updateOrCreateTemplate(data.ses.en)
  }

  await dynamoDB.write(data)

  return response(200, data, event)
})

export default putEmailTemplateLambda
