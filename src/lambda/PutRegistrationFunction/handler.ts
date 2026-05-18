import type { EmailTemplateId, JsonConfirmedEvent, JsonRegistration, RegistrationTemplateContext } from '../../types'
import { GROUP_KEY_RESERVE } from '../../lib/registration'
import { getUsername } from '../auth/api'
import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { audit, registrationAuditKey } from '../lib/audit'
import { emailTo, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { getCancelAuditMessage, getRegistrationChanges, isParticipantGroup } from '../lib/registration'
import { submitRegistration } from '../registration/actions'

const { emailFrom } = CONFIG

const getEmailContext = (
  classification: 'cancelled' | 'confirmed' | 'invitation-read' | 'updated'
): RegistrationTemplateContext => {
  if (classification === 'cancelled') return 'cancel'
  if (classification === 'confirmed') return 'confirm'
  if (classification === 'invitation-read') return 'invitation'
  return 'update'
}

const getAuditMessage = (
  classification: 'cancelled' | 'confirmed' | 'created' | 'invitation-read' | 'updated',
  data: JsonRegistration,
  existing?: JsonRegistration
): string => {
  if (classification === 'cancelled') return getCancelAuditMessage(data)
  if (classification === 'confirmed') return 'Ilmoittautumisen vahvistus'
  if (classification === 'created' || !existing) return 'Ilmoittautui'
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

export const putRegistrationLambda = async (event: APIGatewayProxyEvent) => {
  const username = await getUsername(event)
  const timestamp = new Date().toISOString()
  const origin = getOrigin(event)

  const registration: JsonRegistration = parseJSONWithFallback(event.body)

  // These data can not be submitted by user
  delete registration.paidAmount
  delete registration.paidAt
  delete registration.paymentStatus

  const result = await submitRegistration({ registration, timestamp, username })

  if (result.kind === 'no-op') {
    return response(304, undefined, event)
  }

  if (result.kind === 'entry-closed') {
    return response(410, { message: 'Gone: Entry is not open' }, event)
  }

  if (result.kind === 'already-registered') {
    return response(
      409,
      { cancelled: result.cancelled, message: 'Conflict: Dog already registered to this event' },
      event
    )
  }

  if (result.kind === 'created') {
    const { registration: created, event: confirmedEvent } = result

    const auditMessage = getAuditMessage('created', created)
    if (auditMessage) {
      await audit({
        auditKey: registrationAuditKey(created),
        message: auditMessage,
        user: username,
      })
    }

    if (created.handler?.email && created.owner?.email && confirmedEvent.paymentTime === 'confirmation') {
      await sendMessages(origin, '', created, confirmedEvent)
    }

    return response(200, created, event)
  }

  // result.kind === 'updated'
  const { classification, registration: updated, existing, event: confirmedEvent } = result
  const context = getEmailContext(classification)

  const auditMessage = getAuditMessage(classification, updated, existing)
  if (auditMessage) {
    await audit({
      auditKey: registrationAuditKey(updated),
      message: auditMessage,
      user: username,
    })
  }

  if ((context || confirmedEvent.paymentTime === 'confirmation') && updated.handler?.email && updated.owner?.email) {
    await sendMessages(origin, context, updated, confirmedEvent, existing)
  }

  return response(200, updated, event)
}

export default lambda('putRegistration', putRegistrationLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
