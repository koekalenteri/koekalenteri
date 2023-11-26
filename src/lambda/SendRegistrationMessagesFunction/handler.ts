import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { JsonConfirmedEvent, JsonRegistration, RegistrationMessage } from '../../types'

import { metricScope, type MetricsLogger } from 'aws-embedded-metrics'

import { CONFIG } from '../config'
import { markParticipants } from '../lib/event'
import { sendTemplatedEmailToEventRegistrations, setReserveNotified } from '../lib/registration'
import { authorize, getOrigin } from '../utils/auth'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const { eventTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(registrationTable)

const sendMessagesHandler = metricScope((metrics: MetricsLogger) => async (event: APIGatewayProxyEvent) => {
  const origin = getOrigin(event)

  try {
    const user = await authorize(event)
    if (!user) {
      metricsError(metrics, event.requestContext, 'sendMessageHandler')
      return response(401, 'Unauthorized', event)
    }
    const message: RegistrationMessage = JSON.parse(event.body || '{}')
    const { template, eventId, registrationIds, text } = message

    const eventRegistrations = await dynamoDB.query<JsonRegistration>('eventId = :eventId', { ':eventId': eventId })
    const registrations = eventRegistrations?.filter((r) => registrationIds.includes(r.id))

    if (registrations?.length !== registrationIds.length) {
      metricsError(metrics, event.requestContext, 'sendMessageHandler')
      return response(400, 'Not all registrations were found, aborting!', event)
    }

    let confirmedEvent = await dynamoDB.read<JsonConfirmedEvent>({ id: eventId }, eventTable)

    if (!confirmedEvent) {
      metricsError(metrics, event.requestContext, 'sendMessageHandler')
      return response(404, 'Event not found', event)
    }

    const { ok, failed } = await sendTemplatedEmailToEventRegistrations(
      template,
      confirmedEvent,
      registrations,
      origin,
      text,
      user.name
    )

    if (template === 'reserve') {
      await setReserveNotified(registrations)
    }

    if (template === 'picked' || template === 'invitation') {
      confirmedEvent = await markParticipants(
        confirmedEvent,
        template === 'invitation' ? 'invited' : template,
        registrations[0].class
      )
    }

    metricsSuccess(metrics, event.requestContext, 'sendMessageHandler')
    const { state, classes } = confirmedEvent
    return response(200, { ok, failed, classes, state }, event)
  } catch (err) {
    console.error(err)
    if (err instanceof Error) {
      console.error(err.message)
    }
    metricsError(metrics, event.requestContext, 'sendMessageHandler')
    return response((err as AWSError).statusCode ?? 501, err, event)
  }
})

export default sendMessagesHandler