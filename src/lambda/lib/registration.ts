import type { EmailTemplateId, JsonConfirmedEvent, JsonRegistration, RegistrationTemplateContext } from '../../types'

import { formatDate } from '../../i18n/dates'
import { i18n } from '../../i18n/lambda'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

import { audit, registrationAuditKey } from './audit'
import { emailTo, registrationEmailTemplateData, sendTemplatedMail } from './email'
import { LambdaError } from './lambda'

const { emailFrom, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(registrationTable)

export const getRegistration = async (eventId: string, registrationId: string) => {
  const registration = await dynamoDB.read<JsonRegistration>(
    {
      eventId: eventId,
      id: registrationId,
    },
    registrationTable
  )
  if (!registration) {
    throw new LambdaError(404, `Registration with id '${registrationId}' for event with id '${eventId}' was not found`)
  }
  return registration
}

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

const getLastEmailInfo = (
  template: EmailTemplateId,
  templateName: string,
  registration: JsonRegistration,
  date: string
): string => {
  if (template === 'reserve') {
    return `${templateName} (#${registration.group?.number ?? '?'}) ${date}`
  }

  return `${templateName} ${date}`
}

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
    const data = registrationEmailTemplateData(registration, confirmedEvent, origin, context, text)
    try {
      await sendTemplatedMail(template, registration.language, emailFrom, to, data)
      ok.push(...to)
      audit({
        auditKey: registrationAuditKey(registration),
        message: `${templateName}: ${to.join(', ')}`,
        user,
      })
      await setLastEmail(registration, getLastEmailInfo(template, templateName, registration, lastEmailDate))
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
