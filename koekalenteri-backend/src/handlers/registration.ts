import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'
import { JsonRegistration } from 'koekalenteri-shared/model'
import { nanoid } from 'nanoid'

import { getOrigin, getUsername } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { emailTo, registrationEmailTemplateData } from '../utils/registration'
import { response } from '../utils/response'

import { EMAIL_FROM, sendTemplatedMail } from './email'
import { updateRegistrations } from './event'

export const dynamoDB = new CustomDynamoClient()

export const getRegistrationHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const item = await dynamoDB.read<JsonRegistration>(event.pathParameters)
        if (item) {
          // Make sure not to leak group information to user
          delete item.group
        }
        metricsSuccess(metrics, event.requestContext, 'getRegistration')
        return response(200, item, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getRegistration')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)

export const putRegistrationHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const timestamp = new Date().toISOString()
      const username = getUsername(event)
      const origin = getOrigin(event)

      try {
        let existing
        const registration: JsonRegistration = JSON.parse(event.body || '')
        const update = !!registration.id
        let cancel = false
        if (update) {
          existing = await dynamoDB.read<JsonRegistration>({ eventId: registration.eventId, id: registration.id })
          if (!existing) {
            throw new Error(`Registration not found with id "${registration.id}"`)
          }
          cancel = !existing.cancelled && !!registration.cancelled
        } else {
          registration.id = nanoid(10)
          registration.createdAt = timestamp
          registration.createdBy = username
        }

        // modification info is always updated
        registration.modifiedAt = timestamp
        registration.modifiedBy = username

        const eventTable = process.env.EVENT_TABLE_NAME || ''
        const confirmedEvent = await updateRegistrations(registration.eventId, eventTable, dynamoDB.table)
        if (!confirmedEvent) {
          throw new Error(`Event of type "${registration.eventType}" not found with id "${registration.eventId}"`)
        }

        const data = { ...existing, ...registration }
        await dynamoDB.write(data)

        if (registration.handler?.email && registration.owner?.email) {
          const to = emailTo(registration)
          const context = getEmailContext(update, cancel)
          const data = registrationEmailTemplateData(registration, confirmedEvent, origin, context)

          await sendTemplatedMail('registration', registration.language, EMAIL_FROM, to, data)
        }

        metricsSuccess(metrics, event.requestContext, 'putRegistration')
        return response(200, registration, event)
      } catch (err) {
        console.error(err)
        if (err instanceof Error) {
          console.error(err.message)
        }
        metricsError(metrics, event.requestContext, 'putRegistration')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)

function getEmailContext(update: boolean, cancel: boolean) {
  if (cancel) {
    return 'cancel'
  }
  if (update) {
    return 'update'
  }
  return ''
}
