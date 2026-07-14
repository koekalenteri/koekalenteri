import type { JsonRegistration, Patch } from '../../types'
import { nanoid } from 'nanoid'
import { patchMerge } from '../../lib/utils'
import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { audit, registrationAuditKey } from '../lib/audit'
import { authorize } from '../lib/auth'
import { emailTo, registrationEmailTags, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import {
  assertRegistrationEmailsNotSuppressed,
  normalizeRegistrationEmails,
  shouldClearRegistrationEmailDeliveryStatus,
} from '../lib/emailSuppression'
import { fixRegistrationGroups, updateRegistrations } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { isPatchRequest, lambda, response } from '../lib/lambda'
import {
  clearRegistrationEmailDeliveryStatus,
  createRegistrationPatch,
  findExistingRegistrationToEventForDog,
  getReadyRegistrationsByEventId,
  getRegistration,
  getRegistrationChanges,
  patchRegistration,
  saveRegistration,
} from '../lib/registration'
import { updateEventStatsForRegistration } from '../lib/stats'
import { publishRegistrationPatches } from '../lib/ws/actions'

const { emailFrom } = CONFIG

const putAdminRegistrationLambda = lambda('putAdminRegistration', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const timestamp = new Date().toISOString()
  const origin = getOrigin(event)
  const patchRequest = isPatchRequest(event)

  let existing: JsonRegistration | undefined
  const registration: Patch<JsonRegistration> = parseJSONWithFallback(event.body)
  const clientModifiedAt = registration.modifiedAt
  normalizeRegistrationEmails(registration)

  if (patchRequest && (!registration.eventId || !registration.id)) {
    return response(400, { message: 'Bad request: PATCH requires eventId and id' }, event)
  }

  const update = !!registration.id
  if (update) {
    existing = await getRegistration(
      registration.eventId as JsonRegistration['eventId'],
      registration.id as JsonRegistration['id']
    )
    if (existing?.modifiedAt && clientModifiedAt && existing.modifiedAt !== clientModifiedAt) {
      return response(409, { error: 'staleData', message: 'Registration has been modified since it was loaded' }, event)
    }
  } else {
    // Prevent double registrations when trying to insert new registration
    const alreadyRegistered = await findExistingRegistrationToEventForDog(
      registration.eventId ?? '',
      registration.dog?.regNo ?? ''
    )

    if (alreadyRegistered) {
      return response(
        409,
        {
          cancelled: Boolean(alreadyRegistered.cancelled),
          message: 'Conflict: Dog already registered to this event',
        },
        event
      )
    }

    registration.id = nanoid(10)
    registration.createdAt = timestamp
    registration.createdBy = user.name
    // registrations created by secretary / admin are initially ready (but unpaid)
    registration.state = 'ready'
  }

  // modification info is always updated
  registration.modifiedAt = timestamp
  registration.modifiedBy = user.name
  registration.updatedAt = timestamp

  const data: JsonRegistration = existing
    ? patchRequest
      ? patchMerge(existing, registration)
      : ({ ...existing, ...registration } as JsonRegistration)
    : (registration as JsonRegistration)
  await assertRegistrationEmailsNotSuppressed(data)
  const clearEmailDeliveryStatus = shouldClearRegistrationEmailDeliveryStatus(existing, data)
  if (clearEmailDeliveryStatus) {
    delete data.emailDeliveryStatus
  }

  let savedData = data
  if (existing) {
    savedData = await patchRegistration(data.eventId, data.id, existing, data)
  } else {
    await saveRegistration(data)
  }

  const confirmedEvent = await updateRegistrations(savedData.eventId)

  // Fix group numbers for all registrations in the event (assigns group.number to newly added registrations)
  const readyRegistrations = await getReadyRegistrationsByEventId(savedData.eventId)
  const updatedRegistrations = await fixRegistrationGroups(readyRegistrations, user)
  const updatedData = updatedRegistrations.find((r) => r.id === savedData.id) ?? savedData
  await publishRegistrationPatches(
    savedData.eventId,
    [createRegistrationPatch(updatedData, existing)],
    confirmedEvent.organizer.id
  )

  // Update organizer event stats after registration change
  await updateEventStatsForRegistration(updatedData, existing, confirmedEvent)

  const message = getAuditMessage(updatedData, existing)
  if (message) {
    await audit({
      auditKey: registrationAuditKey(updatedData),
      message,
      user: user.name,
    })
  }

  const context = update ? 'update' : ''
  if (updatedData.handler?.email && updatedData.owner?.email) {
    const to = emailTo(updatedData)
    const templateData = registrationEmailTemplateData(updatedData, confirmedEvent, origin, context)

    if (!clearEmailDeliveryStatus) {
      await clearRegistrationEmailDeliveryStatus(updatedData.eventId, updatedData.id)
      delete updatedData.emailDeliveryStatus
    }
    await sendTemplatedMail(
      'registration',
      updatedData.language,
      emailFrom,
      to,
      templateData,
      registrationEmailTags(updatedData, 'registration')
    )

    await audit({
      auditKey: registrationAuditKey(updatedData),
      message: `Email: ${templateData.subject}, to: ${to.join(', ')}`,
      user: user.name,
    })
  }

  return response(200, updatedData, event)
})

function getAuditMessage(data: JsonRegistration, existing?: JsonRegistration): string {
  if (!existing) return 'Lisäsi ilmoittautumisen'

  return getRegistrationChanges(existing, data)
}

export default putAdminRegistrationLambda
