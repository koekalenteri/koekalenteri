import type { JsonConfirmedEvent, RegistrationMessage } from '../../types'
import { isRegistrationClass } from '../../lib/registration'
import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { audit, eventAuditKey } from '../lib/audit'
import { authorize } from '../lib/auth'
import { getStateFromTemplate, markParticipants } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import {
  findClassesToMark,
  getReadyRegistrationsByEventId,
  groupRegistrationsByClass,
  groupRegistrationsByClassAndGroup,
  sendTemplatedEmailToEventRegistrations,
  setReserveNotified,
} from '../lib/registration'
import { publishEventPatch, publishRegistrationPatches } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { eventTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(registrationTable)

const templateAuditLabels: Partial<Record<RegistrationMessage['template'], string>> = {
  invitation: 'Koekutsu',
  picked: 'Koepaikkailmoitus',
  registration: 'Vahvistusviesti',
  reserve: 'Varasijailmoitus',
}

const templateAuditLabelKeys: Partial<Record<RegistrationMessage['template'], string>> = {
  invitation: 'emailTemplate.invitation',
  picked: 'emailTemplate.picked',
  registration: 'emailTemplate.registration',
  reserve: 'emailTemplate.reserve',
}

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

  const eventRegistrations = await getReadyRegistrationsByEventId(eventId)

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

  if (template === 'invitation' && confirmedEvent.startListPublished === undefined) {
    confirmedEvent.startListPublished = false
    await dynamoDB.update(
      { id: eventId },
      {
        set: { startListPublished: false },
      },
      eventTable
    )
  }

  if (template === 'reserve') {
    await setReserveNotified(registrations)
    for (const registration of registrations) {
      registration.reserveNotified = registration.group?.number ?? 999
    }
  }

  if (template === 'picked' || template === 'invitation') {
    const allEventRegistrations = eventRegistrations || []
    const registrationsByClass = groupRegistrationsByClass(allEventRegistrations)
    const registrationsByClassAndGroup = groupRegistrationsByClassAndGroup(registrationsByClass)
    const classesToMark = findClassesToMark(registrationsByClassAndGroup, template)

    confirmedEvent = await markClassesAsReceived(confirmedEvent, classesToMark, template)
  }

  await audit({
    auditKey: eventAuditKey(confirmedEvent),
    ...(failed.length
      ? {
          details: [
            {
              detailKey: 'audit.details.failedRecipients',
              detailParams: { recipients: failed.join('\n') },
            },
          ],
        }
      : {}),
    message: `${templateAuditLabels[template] ?? template} lähetetty: onnistui ${ok.length}, epäonnistui ${failed.length}`,
    messageKey: 'audit.messages.emailSent',
    messageParams: {
      failed: failed.length,
      ok: ok.length,
      template: templateAuditLabels[template] ?? template,
      templateKey: templateAuditLabelKeys[template] ?? '',
    },
    user: user.name,
  })

  await publishRegistrationPatches(eventId, registrations, confirmedEvent.organizer.id)
  if (template === 'picked' || template === 'invitation') {
    await publishEventPatch(
      {
        classes: confirmedEvent.classes,
        eventId,
        state: confirmedEvent.state,
        ...(template === 'invitation' ? { startListPublished: confirmedEvent.startListPublished } : {}),
      },
      confirmedEvent.organizer.id
    )
  }

  const { state, classes, startListPublished } = confirmedEvent
  return response(200, { classes, failed, ok, registrations, startListPublished, state }, event)
})

export default sendMessagesLambda
