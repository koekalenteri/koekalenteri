import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import AWS from 'aws-sdk'
import type { SendTemplatedEmailRequest, Template } from 'aws-sdk/clients/ses'
import { JsonEmailTemplate, Language } from 'koekalenteri-shared/model'

import CustomDynamoClient from '../utils/CustomDynamoClient'
import { markdownToTemplate } from '../utils/email/markdown'
import { authorize, genericReadAllHandler, getUsername } from '../utils/genericHandlers'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient()
const ses = new AWS.SES()

const stackName = process.env.AWS_SAM_LOCAL ? 'local' : process.env.STACK_NAME ?? 'local'

export enum EmailTemplate {
  REGISTRATION = 'registration',
}

export async function sendTemplatedMail(template: EmailTemplate, language: Language, from: string, to: string[], data: Record<string, unknown>) {
  const params: SendTemplatedEmailRequest = {
    ConfigurationSetName: 'Koekalenteri',
    Destination: {
      ToAddresses: to,
    },
    Template: `${template}-${stackName}-${language}`,
    TemplateData: JSON.stringify(data),
    Source: from,
  }

  try {
    return ses.sendTemplatedEmail(params).promise()
  } catch (e) {
    // TODO: queue for retry based on error
    console.log('Failed to send email', e)
  }
}

export const getTemplatesHandler = genericReadAllHandler(dynamoDB, 'getTemplates')

export const putTemplateHandler = metricScope((metrics: MetricsLogger) =>
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    authorize(event)

    const timestamp = new Date().toISOString()
    const username = getUsername(event)

    try {
      const item: JsonEmailTemplate = JSON.parse(event.body || "")
      const existing = await dynamoDB.read<JsonEmailTemplate>({ id: item.id })

      // modification info is always updated
      item.modifiedAt = timestamp
      item.modifiedBy = username

      const data: JsonEmailTemplate = { ...existing, ...item }

      // Generate SES compatible template for all languages
      data.ses = {
        fi: await markdownToTemplate(`${item.id}-${stackName}-fi`, data.fi),
        en: await markdownToTemplate(`${item.id}-${stackName}-en`, data.en),
      }

      await updateOrCreateTemplate(data.ses.fi)
      await updateOrCreateTemplate(data.ses.en)

      await dynamoDB.write(data)

      metricsSuccess(metrics, event.requestContext, 'putTemplate')
      return response(200, data)
    } catch (err) {
      console.error(err)
      metricsError(metrics, event.requestContext, 'putTemplate')
      return response((err as AWS.AWSError).statusCode || 501, err)
    }
  },
)

async function updateOrCreateTemplate(template: Template) {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const res = await ses.updateTemplate({Template: template}).promise()
    console.info(res)
  } catch(e: any) {
    if (e.code !== 'TemplateDoesNotExist') {
      console.error(e)
      throw e
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const res = await ses.createTemplate({Template: template}).promise()
    console.info(res)
  }
}
