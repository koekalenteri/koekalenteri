import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { Template } from 'aws-sdk/clients/ses'
import type { JsonEmailTemplate, JsonRegistration } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import AWS from 'aws-sdk'

import { CONFIG } from '../config'
import { authorize, getUsername } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { markdownToTemplate } from '../utils/email/markdown'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient()
const ses = new AWS.SES()

const updateOrCreateTemplate = async (template: Template) => {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const res = await ses.updateTemplate({ Template: template }).promise()
    console.info(res)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    if (e.code !== 'TemplateDoesNotExist') {
      console.error(e)
      throw e
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const res = await ses.createTemplate({ Template: template }).promise()
    console.info(res)
  }
}

const putTemplateHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const user = await authorize(event)
      if (!user?.admin) {
        return response(401, 'Unauthorized', event)
      }

      const timestamp = new Date().toISOString()
      const username = await getUsername(event)

      try {
        const item: JsonEmailTemplate = JSON.parse(event.body || '{}')
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

        await updateOrCreateTemplate(data.ses.fi)
        await updateOrCreateTemplate(data.ses.en)

        await dynamoDB.write(data)

        metricsSuccess(metrics, event.requestContext, 'putTemplate')
        return response(200, data, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'putTemplate')
        return response((err as AWS.AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default putTemplateHandler
