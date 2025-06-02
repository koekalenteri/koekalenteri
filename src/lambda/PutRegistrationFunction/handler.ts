import type { EmailTemplateId, JsonConfirmedEvent, JsonRegistration, RegistrationTemplateContext } from '../../types'

import { nanoid } from 'nanoid'

import { GROUP_KEY_RESERVE } from '../../lib/registration'
import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { audit, registrationAuditKey } from '../lib/audit'
import { getUsername } from '../lib/auth'
import { emailTo, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import { getEvent, updateRegistrations } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import {
  findExistingRegistrationToEventForDog,
  getCancelAuditMessage,
  getRegistration,
  getRegistrationChanges,
  isParticipantGroup,
  saveRegistration,
} from '../lib/registration'
import { updateEventStatsForRegistration } from '../lib/stats'

const { emailFrom } = CONFIG

const getData = async (registration: JsonRegistration) => {
  const confirmedEvent = await getEvent<JsonConfirmedEvent>(registration.eventId)
  const existing = registration.id ? await getRegistration(registration.eventId, registration.id) : undefined

  return { confirmedEvent, existing }
}

const getEmailContext = (update: boolean, cancel: boolean, confirm: boolean, invitation: boolean) => {
  if (cancel) return 'cancel'
  if (confirm) return 'confirm'
  if (invitation) return 'invitation'
  if (update) return 'update'
  return ''
}

const getAuditMessage = (
  cancel: boolean,
  confirm: boolean,
  data: JsonRegistration,
  existing?: JsonRegistration
): string => {
  if (cancel) return getCancelAuditMessage(data)
  if (confirm) return 'Ilmoittautumisen vahvistus'
  if (!existing) return 'Ilmoittautui'

  return getRegistrationChanges(existing, data)
}

const sendMessages = async (
  origin: string,
  context: RegistrationTemplateContext,
  registration: JsonRegistration,
  confirmedEvent: JsonConfirmedEvent,
  existing?: JsonRegistration
) => {
  // send update message when registration is updated, confirmed or cancelled
  const to = emailTo(registration)
  const templateData = registrationEmailTemplateData(registration, confirmedEvent, origin, context)

  await sendTemplatedMail('registration', registration.language, emailFrom, to, templateData)

  // also notify secretary about cancellation (allowed to fail)
  try {
    const secretaryEmail = confirmedEvent.contactInfo?.secretary?.email ?? confirmedEvent.secretary.email
    if (context === 'cancel' && secretaryEmail) {
      let template: EmailTemplateId | undefined = undefined

      const groupKey = existing?.group?.key ?? GROUP_KEY_RESERVE
      if (groupKey === GROUP_KEY_RESERVE) {
        template = registration.reserveNotified ? 'cancel-reserve' : 'cancel-early'
      } else if (isParticipantGroup(groupKey)) {
        template = 'cancel-picked'
      }

      if (template) {
        const cancelTemplateData = registrationEmailTemplateData(
          registration,
          confirmedEvent,
          origin,
          context,
          '',
          existing?.group
        )
        await sendTemplatedMail(template, 'fi', emailFrom, [secretaryEmail], cancelTemplateData)
      }
    }
  } catch (e) {
    console.error('error notifying cancellation to secretary', e)
  }
}

const putRegistrationLambda = lambda('putRegistration', async (event) => {
  const username = await getUsername(event)
  const timestamp = new Date().toISOString()
  const origin = getOrigin(event)

  const registration: JsonRegistration = parseJSONWithFallback(event.body)
  const { confirmedEvent, existing } = await getData(registration)

  if (!existing) {
    // Prevent double registrations when trying to insert new registration
    const alreadyRegistered = await findExistingRegistrationToEventForDog(registration.eventId, registration.dog.regNo)

    if (alreadyRegistered) {
      return response(
        409,
        {
          message: 'Conflict: Dog already registered to this event',
          cancelled: Boolean(alreadyRegistered.cancelled),
        },
        event
      )
    }

    registration.id = nanoid(10)
    registration.createdAt = timestamp
    registration.createdBy = username
  }

  const update = !!existing
  const cancel = !existing?.cancelled && !!registration.cancelled
  const confirm = !existing?.confirmed && !!registration.confirmed && !existing?.cancelled
  const invitation = !existing?.invitationRead && !!registration.invitationRead && !existing?.cancelled

  // modification info is always updated
  registration.modifiedAt = timestamp
  registration.modifiedBy = username

  const data: JsonRegistration = { ...existing, ...registration }
  await saveRegistration(data)
  // Update organizer event stats after registration change
  await updateEventStatsForRegistration(data, existing, confirmedEvent)

  if (cancel) {
    await updateRegistrations(registration.eventId)
  }

  const message = getAuditMessage(cancel, confirm, data, existing)
  if (message) {
    audit({
      auditKey: registrationAuditKey(registration),
      message,
      user: username,
    })
  }

  const context = getEmailContext(update, cancel, confirm, invitation)
  if (context && registration.handler?.email && registration.owner?.email) {
    await sendMessages(origin, context, registration, confirmedEvent, existing)
  }

  return response(200, data, event)
})

export default putRegistrationLambda
