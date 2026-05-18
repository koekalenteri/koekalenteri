import type { Template } from '@aws-sdk/client-ses'
import type { JsonEmailTemplate } from '../../types'
import {
  CreateTemplateCommand,
  SESClient,
  TemplateDoesNotExistException,
  UpdateTemplateCommand,
} from '@aws-sdk/client-ses'
import { authorize, getUsername } from '../auth/api'
import { CONFIG } from '../config'
import { emailTemplateRepository } from '../emailTemplate/repository'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { markdownToTemplate } from '../utils/email/markdown'

const ses = new SESClient()

const updateOrCreateTemplate = async (template: Template) => {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const command = new UpdateTemplateCommand({ Template: template })
    const res = await ses.send(command)
    console.info(res)
  } catch (e) {
    if (e instanceof TemplateDoesNotExistException) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        const command = new CreateTemplateCommand({ Template: template })
        const res = await ses.send(command)
        console.info(res)
      } catch (createError) {
        console.error(createError)
        throw createError
      }
    } else {
      console.error(e)
      throw e
    }
  }
}

export const putEmailTemplateLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

  const timestamp = new Date().toISOString()
  const username = await getUsername(event)

  const item: JsonEmailTemplate = parseJSONWithFallback(event.body)
  const existing = await emailTemplateRepository.readById(item.id)

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

  await emailTemplateRepository.write(data)

  return response(200, data, event)
}

export default lambda('putEmailTemplate', putEmailTemplateLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
