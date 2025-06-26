import type { JsonConfirmedEvent, JsonRegistration, RegistrationMessage } from '../../types'

import { isRegistrationClass } from '../../lib/registration'
import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { authorize } from '../lib/auth'
import { markParticipants } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { isParticipantGroup, sendTemplatedEmailToEventRegistrations, setReserveNotified } from '../lib/registration'
import CustomDynamoClient from '../utils/CustomDynamoClient'

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
    // Get all registrations for this event that are in the ready state
    const allEventRegistrations = eventRegistrations || []

    // Group registrations by class or eventType if class is not available
    const registrationsByClass: Record<string, JsonRegistration[]> = {}
    for (const reg of allEventRegistrations) {
      // Use class if available, otherwise use eventType
      const classKey = reg.class || reg.eventType
      registrationsByClass[classKey] = registrationsByClass[classKey] || []
      registrationsByClass[classKey].push(reg)
    }

    // Further group registrations by their group key within each class
    const registrationsByClassAndGroup: Record<string, Record<string, JsonRegistration[]>> = {}
    for (const [classKey, classRegs] of Object.entries(registrationsByClass)) {
      registrationsByClassAndGroup[classKey] = {}

      for (const reg of classRegs) {
        // Skip registrations that are on reserve/cancelled
        if (!isParticipantGroup(reg.group?.key)) continue

        // isParticipantGroup test above makes sure the group key is available
        const groupKey = reg.group!.key
        registrationsByClassAndGroup[classKey][groupKey] = registrationsByClassAndGroup[classKey][groupKey] || []
        registrationsByClassAndGroup[classKey][groupKey].push(reg)
      }
    }

    // Check which classes have all registrations with the message sent
    const classesToMark: string[] = []
    for (const [classKey, groupsMap] of Object.entries(registrationsByClassAndGroup)) {
      let allGroupsReceived = true

      // Check each group in this class
      for (const [_, groupRegs] of Object.entries(groupsMap)) {
        // Skip empty groups
        if (groupRegs.length === 0) continue

        // Check if all registrations in this group have received the message
        const allReceived = groupRegs.every((reg) => reg.messagesSent && reg.messagesSent[template])

        if (!allReceived) {
          allGroupsReceived = false
          break
        }
      }

      // If all groups in this class have received the message, mark the class
      if (allGroupsReceived && Object.keys(groupsMap).length > 0) {
        classesToMark.push(classKey)
      }
    }

    // Mark each class where all registrations have received the message
    for (const classKey of classesToMark) {
      // Only pass the classKey to markParticipants when it is a valid RegistrationClass
      confirmedEvent = await markParticipants(
        confirmedEvent,
        template === 'invitation' ? 'invited' : template,
        isRegistrationClass(classKey) ? classKey : undefined
      )
    }
  }

  const { state, classes } = confirmedEvent
  return response(200, { ok, failed, classes, state, registrations }, event)
})

export default sendMessagesLambda
