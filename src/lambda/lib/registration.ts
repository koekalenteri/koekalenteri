import type { EmailTemplateId, JsonConfirmedEvent, JsonRegistration } from '../../types'
import type { RegistrationTemplateContext } from '../utils/registration'

import { formatDate } from '../../i18n/dates'
import { i18n } from '../../i18n/lambda'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { emailTo, registrationEmailTemplateData } from '../utils/registration'

import { audit, registrationAuditKey } from './audit'
import { sendTemplatedMail } from './email'

const { emailFrom, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(registrationTable)

export const updateRegistrationField = async <F extends keyof JsonRegistration>(
  eventId: JsonRegistration['eventId'],
  id: JsonRegistration['id'],
  field: F,
  value: JsonRegistration[F]
) =>
  dynamoDB.update(
    { eventId, id },
    'set #field = :value',
    {
      '#field': field,
    },
    {
      ':value': value,
    }
  )

const setLastEmail = async (reg: JsonRegistration, value: string) => {
  // update the in-memory object too
  reg.lastEmail = value
  return updateRegistrationField(reg.eventId, reg.id, 'lastEmail', value)
}

export const setReserveNotified = async (registrations: JsonRegistration[]) =>
  Promise.all(
    registrations
      .filter((r) => !r.reserveNotified)
      .map(({ eventId, id }) => updateRegistrationField(eventId, id, 'reserveNotified', true))
  )

export const sendTemplatedEmailToEventRegistrations = async (
  template: EmailTemplateId,
  confirmedEvent: JsonConfirmedEvent,
  registrations: JsonRegistration[],
  origin: string | undefined,
  text: string,
  user: string,
  context: RegistrationTemplateContext
) => {
  const t = i18n.getFixedT('fi')
  const lastEmailDate = formatDate(new Date(), 'd.M.yyyy HH:mm')
  const templateName = t(`emailTemplate.${template}`)
  const ok: string[] = []
  const failed: string[] = []
  for (const registration of registrations) {
    const to = emailTo(registration)
    const data = registrationEmailTemplateData(registration, confirmedEvent, origin, context)
    try {
      await sendTemplatedMail(template, registration.language, emailFrom, to, { ...data, text })
      ok.push(...to)
      audit({
        auditKey: registrationAuditKey(registration),
        message: `${templateName}: ${to.join(', ')}`,
        user,
      })
      await setLastEmail(registration, `${templateName} ${lastEmailDate}`)
    } catch (e) {
      failed.push(...to)
      audit({
        auditKey: registrationAuditKey(registration),
        message: `FAILED ${templateName}: ${to.join(', ')}`,
        user,
      })
      console.error(e)
    }
  }
  return { ok, failed }
}
