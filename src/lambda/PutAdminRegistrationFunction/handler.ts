import type { JsonRegistration } from '../../types'
import { nanoid } from 'nanoid'
import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { audit, registrationAuditKey } from '../lib/audit'
import { authorize } from '../lib/auth'
import { emailTo, registrationEmailTags, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import { assertRegistrationEmailsNotSuppressed, normalizeRegistrationEmails } from '../lib/emailSuppression'
import { fixRegistrationGroups, updateRegistrations } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import {
  clearRegistrationEmailDeliveryStatus,
  findExistingRegistrationToEventForDog,
  getReadyRegistrationsByEventId,
  getRegistration,
  getRegistrationChanges,
  saveRegistration,
} from '../lib/registration'
import { updateEventStatsForRegistration } from '../lib/stats'

const { emailFrom } = CONFIG

const putAdminRegistrationLambda = lambda('putAdminRegistration', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const timestamp = new Date().toISOString()
  const origin = getOrigin(event)

  let existing: JsonRegistration | undefined
  const registration: JsonRegistration = parseJSONWithFallback(event.body)
  normalizeRegistrationEmails(registration)
  const update = !!registration.id
  if (update) {
    existing = await getRegistration(registration.eventId, registration.id)
  } else {
    // Prevent double registrations when trying to insert new registration
    const alreadyRegistered = await findExistingRegistrationToEventForDog(registration.eventId, registration.dog.regNo)

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

    await assertRegistrationEmailsNotSuppressed(registration)

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
  await saveRegistration(data)

  const confirmedEvent = await updateRegistrations(registration.eventId)

  // Fix group numbers for all registrations in the event (assigns group.number to newly added registrations)
  const readyRegistrations = await getReadyRegistrationsByEventId(registration.eventId)
  const updatedRegistrations = await fixRegistrationGroups(readyRegistrations, user)
  const updatedData = updatedRegistrations.find((r) => r.id === data.id) ?? data

  // Update organizer event stats after registration change
  await updateEventStatsForRegistration(updatedData, existing, confirmedEvent)

  const message = getAuditMessage(updatedData, existing)
  if (message) {
    await audit({
      auditKey: registrationAuditKey(registration),
      message,
      user: user.name,
    })
  }

  const context = update ? 'update' : ''
  if (registration.handler?.email && registration.owner?.email) {
    const to = emailTo(registration)
    const templateData = registrationEmailTemplateData(updatedData, confirmedEvent, origin, context)

    await clearRegistrationEmailDeliveryStatus(updatedData.eventId, updatedData.id)
    await sendTemplatedMail(
      'registration',
      registration.language,
      emailFrom,
      to,
      templateData,
      registrationEmailTags(updatedData, 'registration')
    )

    await audit({
      auditKey: registrationAuditKey(registration),
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
