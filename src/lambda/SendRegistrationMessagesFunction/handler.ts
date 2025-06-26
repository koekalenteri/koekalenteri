import type { JsonConfirmedEvent, JsonRegistration, RegistrationMessage } from '../../types'

import { isRegistrationClass } from '../../lib/registration'
import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { authorize } from '../lib/auth'
import { getStateFromTemplate, markParticipants } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import {
  findClassesToMark,
  groupRegistrationsByClass,
  groupRegistrationsByClassAndGroup,
  sendTemplatedEmailToEventRegistrations,
  setReserveNotified,
} from '../lib/registration'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { eventTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(registrationTable)

/**
 * Mark classes as having received the specified template
 */
const markClassesAsReceived = async (
  confirmedEvent: JsonConfirmedEvent,
  classesToMark: string[],
  template: string
): Promise<JsonConfirmedEvent> => {
  let updatedEvent = confirmedEvent

  for (const classKey of classesToMark) {
    const state = getStateFromTemplate(template)
    const classToUse = isRegistrationClass(classKey) ? classKey : undefined

    updatedEvent = await markParticipants(updatedEvent, state, classToUse)
  }

  return updatedEvent
}

const sendMessagesLambda = lambda('sendMessages', async (event) => {
  const origin = getOrigin(event)

  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const message: RegistrationMessage = parseJSONWithFallback(event.body)
  const { template, eventId, contactInfo, registrationIds, text } = message

  const eventRegistrations = (
    await dynamoDB.query<JsonRegistration>({
      key: 'eventId = :eventId',
      values: { ':eventId': eventId },
    })
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
    const allEventRegistrations = eventRegistrations || []
    const registrationsByClass = groupRegistrationsByClass(allEventRegistrations)
    const registrationsByClassAndGroup = groupRegistrationsByClassAndGroup(registrationsByClass)
    const classesToMark = findClassesToMark(registrationsByClassAndGroup, template)

    confirmedEvent = await markClassesAsReceived(confirmedEvent, classesToMark, template)
  }

  const { state, classes } = confirmedEvent
  return response(200, { ok, failed, classes, state, registrations }, event)
})

export default sendMessagesLambda
