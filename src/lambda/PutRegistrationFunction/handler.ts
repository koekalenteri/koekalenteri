import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonConfirmedEvent, JsonRegistration } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { diff } from 'deep-object-diff'
import { nanoid } from 'nanoid'

import { i18n } from '../../i18n/lambda'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { getOrigin, getUsername } from '../lib/auth'
import { sendTemplatedMail } from '../lib/email'
import { parseJSONWithFallback } from '../lib/json'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { emailTo, registrationEmailTemplateData } from '../utils/registration'
import { response } from '../utils/response'

const { emailFrom, eventTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(registrationTable)

const putRegistrationHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const username = await getUsername(event)
      const timestamp = new Date().toISOString()
      const origin = getOrigin(event)

      try {
        let existing
        const registration: JsonRegistration = parseJSONWithFallback(event.body)
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

        const confirmedEvent = await dynamoDB.read<JsonConfirmedEvent>({ id: registration.eventId }, eventTable)

        if (!confirmedEvent) {
          throw new Error(`Event of type "${registration.eventType}" not found with id "${registration.eventId}"`)
        }

        const data: JsonRegistration = { ...existing, ...registration }
        await dynamoDB.write(data)

        const message = getAuditMessage(cancel, confirm, data, existing)
        if (message) {
          audit({
            auditKey: registrationAuditKey(registration),
            message,
            user: username,
          })
        }

        const context = getEmailContext(update, cancel, confirm)
        if (context && registration.handler?.email && registration.owner?.email) {
          // send update message when registration is updated, confirmed or cancelled
          const to = emailTo(registration)
          const templateData = registrationEmailTemplateData(registration, confirmedEvent, origin, context)

          await sendTemplatedMail('registration', registration.language, emailFrom, to, templateData)
        }

        metricsSuccess(metrics, event.requestContext, 'putRegistration')
        return response(200, data, event)
      } catch (err) {
        console.error(err)
        if (err instanceof Error) {
          console.error(err.message)
        }
        metricsError(metrics, event.requestContext, 'putRegistration')
        return response((err as AWSError).statusCode ?? 501, err, event)
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
  if (cancel) return 'Ilmoittautuminen peruttiin'
  if (confirm) return 'Ilmoittautumisen vahvistus'
  if (!existing) return ''

  const t = i18n.getFixedT('fi')
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

export default putRegistrationHandler
