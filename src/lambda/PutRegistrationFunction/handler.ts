import type {
  EmailTemplateId,
  JsonConfirmedEvent,
  JsonRegistration,
  Patch,
  RegistrationTemplateContext,
} from '../../types'
import { nanoid } from 'nanoid'
import { GROUP_KEY_RESERVE, isParticipantGroup } from '../../lib/registration'
import { isEntryOpen, patchMerge } from '../../lib/utils'
import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { audit, registrationAuditKey } from '../lib/audit'
import { getUsername } from '../lib/auth'
import { emailTo, registrationEmailTags, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import {
  assertRegistrationEmailsNotSuppressed,
  normalizeRegistrationEmails,
  shouldClearRegistrationEmailDeliveryStatus,
} from '../lib/emailSuppression'
import { getEvent, updateRegistrations } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import {
  clearRegistrationEmailDeliveryStatus,
  createRegistrationPatch,
  findExistingRegistrationToEventForDog,
  getCancelAuditMessage,
  getRegistration,
  getRegistrationChanges,
  hasRegistrationChanges,
  patchRegistration,
  saveRegistration,
} from '../lib/registration'
import { updateEventStatsForRegistration } from '../lib/stats'
import { publishRegistrationPatches } from '../lib/ws/actions'

const { emailFrom } = CONFIG

const getData = async (registration: Patch<JsonRegistration>) => {
  const eventId = registration.eventId as JsonRegistration['eventId']
  const id = registration.id as JsonRegistration['id'] | undefined
  const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId)
  const existing = id ? await getRegistration(eventId, id) : undefined

  return { confirmedEvent, existing }
}

const removeUserControlledPaymentFields = (registration: Patch<JsonRegistration>) => {
  delete registration.paidAmount
  delete registration.paidAt
  delete registration.paymentStatus
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

const prepareNewRegistration = async (
  registration: Patch<JsonRegistration>,
  confirmedEvent: JsonConfirmedEvent,
  timestamp: string,
  username: string,
  event: Parameters<typeof response>[2]
) => {
  if (!isEntryOpen(confirmedEvent)) {
    return response(410, { message: 'Gone: Entry is not open' }, event)
  }

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
  registration.createdBy = username
  registration.state = confirmedEvent.paymentTime === 'confirmation' ? 'ready' : 'creating'
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

  await clearRegistrationEmailDeliveryStatus(registration.eventId, registration.id)
  delete registration.emailDeliveryStatus
  await sendTemplatedMail(
    'registration',
    registration.language,
    emailFrom,
    to,
    templateData,
    registrationEmailTags(registration, 'registration')
  )

  await audit({
    auditKey: registrationAuditKey(registration),
    message: `Email: ${templateData.subject}, to: ${to.join(', ')}`,
    user: 'anonymous',
  })

  // also notify secretary about cancellation (allowed to fail)
  try {
    const secretaryEmail = confirmedEvent.contactInfo?.secretary?.email ?? confirmedEvent.secretary.email
    if (context === 'cancel' && secretaryEmail) {
      let template: EmailTemplateId | undefined

      const groupKey = existing?.group?.key ?? GROUP_KEY_RESERVE
      if (groupKey === GROUP_KEY_RESERVE) {
        template = existing?.reserveNotified ? 'cancel-reserve' : 'cancel-early'
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
  const isPatchRequest = event.httpMethod === 'PATCH'

  const registration: Patch<JsonRegistration> = parseJSONWithFallback(event.body)
  normalizeRegistrationEmails(registration)

  if (isPatchRequest && (!registration.eventId || !registration.id)) {
    return response(400, { message: 'Bad request: PATCH requires eventId and id' }, event)
  }

  removeUserControlledPaymentFields(registration)

  const { confirmedEvent, existing } = await getData(registration)

  if (!confirmedEvent) {
    return response(404, { message: 'Not found' }, event)
  }

  if (!existing) {
    const errorResponse = await prepareNewRegistration(registration, confirmedEvent, timestamp, username, event)
    if (errorResponse) return errorResponse
  }

  const update = !!existing
  const cancel = !existing?.cancelled && !!registration.cancelled
  const confirm = !existing?.confirmed && !!registration.confirmed && !existing?.cancelled
  const invitation = !existing?.invitationRead && !!registration.invitationRead && !existing?.cancelled

  // modification info is always updated
  registration.modifiedAt = timestamp
  registration.modifiedBy = username
  registration.updatedAt = timestamp

  const data: JsonRegistration = existing
    ? isPatchRequest
      ? patchMerge(existing, registration)
      : ({ ...existing, ...registration } as JsonRegistration)
    : (registration as JsonRegistration)

  if (existing && !hasRegistrationChanges(existing, data)) {
    return response(304, undefined, event)
  }

  await assertRegistrationEmailsNotSuppressed(data)

  if (shouldClearRegistrationEmailDeliveryStatus(existing, data)) {
    delete data.emailDeliveryStatus
  }

  let savedData = data
  if (existing) {
    savedData = await patchRegistration(data.eventId, data.id, existing, data)
  } else {
    await saveRegistration(data)
  }
  // Update organizer event stats after registration change
  await updateEventStatsForRegistration(savedData, existing, confirmedEvent)

  if (update || cancel || savedData.state === 'ready') {
    const updatedEvent = await updateRegistrations(savedData.eventId)
    await publishRegistrationPatches(
      savedData.eventId,
      [createRegistrationPatch(savedData, existing)],
      updatedEvent.organizer.id
    )
  }

  const message = getAuditMessage(cancel, confirm, savedData, existing)
  if (message) {
    await audit({
      auditKey: registrationAuditKey(savedData),
      message,
      user: username,
    })
  }

  const context = getEmailContext(update, cancel, confirm, invitation)
  if (
    (context || confirmedEvent.paymentTime === 'confirmation') &&
    savedData.handler?.email &&
    savedData.owner?.email
  ) {
    await sendMessages(origin, context, savedData, confirmedEvent, existing)
  }

  return response(200, savedData, event)
})

export default putRegistrationLambda
