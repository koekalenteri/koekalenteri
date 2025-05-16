import type { JsonConfirmedEvent, JsonRegistration, RegistrationMessage } from '../../types'

import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { authorize } from '../lib/auth'
import { markParticipants } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda } from '../lib/lambda'
import { sendTemplatedEmailToEventRegistrations, setReserveNotified } from '../lib/registration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { response } from '../utils/response'

const { eventTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(registrationTable)

const sendMessagesLambda = lambda('sendMessages', async (event) => {
  const origin = getOrigin(event)

  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }
  const message: RegistrationMessage = parseJSONWithFallback(event.body)
  const { template, eventId, contactInfo, registrationIds, text } = message

  const eventRegistrations = (
    await dynamoDB.query<JsonRegistration>('eventId = :eventId', { ':eventId': eventId })
  )?.filter((r) => r.state === 'ready')
  const registrations = eventRegistrations?.filter((r) => registrationIds.includes(r.id))

  if (registrations?.length !== registrationIds.length) {
    return response(400, 'Not all registrations were found, aborting!', event)
  }

  let confirmedEvent = await dynamoDB.read<JsonConfirmedEvent>({ id: eventId }, eventTable)

  if (!confirmedEvent) {
    return response(404, 'Event not found', event)
  }

  const { ok, failed } = await sendTemplatedEmailToEventRegistrations(
    template,
    { ...confirmedEvent, contactInfo },
    registrations,
    origin,
    text,
    user.name,
    ''
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

  const { state, classes } = confirmedEvent
  return response(200, { ok, failed, classes, state, registrations }, event)
})

export default sendMessagesLambda
