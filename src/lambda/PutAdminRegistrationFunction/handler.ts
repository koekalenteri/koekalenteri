import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonRegistration } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { diff } from 'deep-object-diff'
import { nanoid } from 'nanoid'

import { i18n } from '../../i18n/lambda'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { authorize, getOrigin } from '../lib/auth'
import { emailTo, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import { updateRegistrations } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const { emailFrom, eventTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(registrationTable)

const putAdminRegistrationHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const user = await authorize(event)
      if (!user) {
        return response(401, 'Unauthorized', event)
      }

      const timestamp = new Date().toISOString()
      const origin = getOrigin(event)

      try {
        let existing
        const registration: JsonRegistration = parseJSONWithFallback(event.body)
        const update = !!registration.id
        if (update) {
          existing = await dynamoDB.read<JsonRegistration>({ eventId: registration.eventId, id: registration.id })
          if (!existing) {
            throw new Error(`Registration not found with id "${registration.id}"`)
          }
        } else {
          registration.id = nanoid(10)
          registration.createdAt = timestamp
          registration.createdBy = user.name
          // registrations created by secretary / admin are initially ready (but unpaid)
          registration.state = 'ready'
        }

        // modification info is always updated
        registration.modifiedAt = timestamp
        registration.modifiedBy = user.name

        const data: JsonRegistration = { ...existing, ...registration }
        await dynamoDB.write(data)

        const confirmedEvent = await updateRegistrations(registration.eventId, eventTable)

        const message = getAuditMessage(data, existing)
        if (message) {
          audit({
            auditKey: registrationAuditKey(registration),
            message,
            user: user.name,
          })
        }

        const context = update ? 'update' : ''
        if (registration.handler?.email && registration.owner?.email) {
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

function getAuditMessage(data: JsonRegistration, existing?: JsonRegistration): string {
  if (!existing) return 'Lisäsi ilmoittautumisen'

  const t = i18n.getFixedT('fi')
  const changes: Partial<JsonRegistration> = diff(existing, data)
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

export default putAdminRegistrationHandler
