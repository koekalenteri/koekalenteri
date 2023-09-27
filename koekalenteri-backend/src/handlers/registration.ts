import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonRegistration } from 'koekalenteri-shared/model'

import { metricScope } from 'aws-embedded-metrics'
import { diff } from 'deep-object-diff'
import { getFixedT } from 'i18next'
import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { getOrigin, getUsername } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { emailTo, registrationEmailTemplateData } from '../utils/registration'
import { response } from '../utils/response'

import { updateRegistrations } from './admin/event'
import { sendTemplatedMail } from './email'

const dynamoDB = new CustomDynamoClient()
const { emailFrom, eventTable } = CONFIG

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
      const username = await getUsername(event)
      const timestamp = new Date().toISOString()
      const origin = getOrigin(event)

      try {
        let existing
        const registration: JsonRegistration = JSON.parse(event.body || '{}')
        const update = !!registration.id
        let cancel = false
        let confirm = false
        if (update) {
          existing = await dynamoDB.read<JsonRegistration>({ eventId: registration.eventId, id: registration.id })
          if (!existing) {
            throw new Error(`Registration not found with id "${registration.id}"`)
          }
          cancel = !existing.cancelled && !!registration.cancelled
          confirm = !existing.confirmed && !!registration.confirmed && !existing.cancelled
        } else {
          registration.id = nanoid(10)
          registration.createdAt = timestamp
          registration.createdBy = username
        }

        // modification info is always updated
        registration.modifiedAt = timestamp
        registration.modifiedBy = username

        const data = { ...existing, ...registration }
        await dynamoDB.write(data)

        const confirmedEvent = await updateRegistrations(registration.eventId, eventTable, dynamoDB.table)
        if (!confirmedEvent) {
          throw new Error(`Event of type "${registration.eventType}" not found with id "${registration.eventId}"`)
        }

        const message = getAuditMessage(cancel, confirm, data, existing)
        if (message) {
          audit({
            auditKey: registrationAuditKey(registration),
            message,
            user: username,
          })
        }

        if (registration.handler?.email && registration.owner?.email) {
          const to = emailTo(registration)
          const context = getEmailContext(update, cancel, confirm)
          const data = registrationEmailTemplateData(registration, confirmedEvent, origin, context)

          await sendTemplatedMail('registration', registration.language, emailFrom, to, data)
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

function getEmailContext(update: boolean, cancel: boolean, confirm: boolean) {
  if (cancel) return 'cancel'
  if (confirm) return 'confirm'
  if (update) return 'update'
  return ''
}

function getAuditMessage(
  cancel: boolean,
  confirm: boolean,
  data: JsonRegistration,
  existing?: JsonRegistration
): string {
  if (cancel) return 'Ilmoittautuminen peruttuun'
  if (confirm) return 'Ilmoittautumisen vahvistus'
  if (!existing) return ''

  const t = getFixedT('fi')
  const changes: Partial<JsonRegistration> = diff(data, existing)
  console.debug('Audit changes', changes)
  const keys = ['class', 'dog', 'breeder', 'owner', 'handler', 'qualifyingResults', 'notes'] as const
  const modified: string[] = []

  for (const key of keys) {
    if (changes[key]) {
      modified.push(t(`registration.${key}`))
    }
  }

  return modified.length ? 'Muutti: ' + modified.join(', ') : ''
}
