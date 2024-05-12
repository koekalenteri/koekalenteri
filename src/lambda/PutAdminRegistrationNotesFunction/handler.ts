import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonRegistration } from '../../types'

import { metricScope } from 'aws-embedded-metrics'

import { audit, registrationAuditKey } from '../lib/audit'
import { authorize } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { updateRegistrationField } from '../lib/registration'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const putAdminRegistrationNotesHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      const user = await authorize(event)
      if (!user) {
        return response(401, 'Unauthorized', event)
      }

      try {
        const { eventId, id, internalNotes }: Pick<JsonRegistration, 'eventId' | 'id' | 'internalNotes'> =
          parseJSONWithFallback(event.body)

        if (!eventId || !id) throw new Error('Event id or registration id missing')

        await updateRegistrationField(eventId, id, 'internalNotes', internalNotes)
        await audit({
          auditKey: registrationAuditKey({ eventId, id }),
          user: user.name,
          message: 'Muutti sisäistä kommenttia',
        })

        metricsSuccess(metrics, event.requestContext, 'putRegistration')
        return response(200, 'ok', event)
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

export default putAdminRegistrationNotesHandler
