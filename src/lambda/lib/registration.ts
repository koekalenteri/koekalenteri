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

const setLastEmail = async ({ eventId, id }: JsonRegistration, value: string) =>
  dynamoDB.update(
    { eventId, id },
    'set #field = :value',
    {
      '#field': 'lastEmail',
    },
    {
      ':value': value,
    }
  )

export const setReserveNotified = async (registrations: JsonRegistration[]) =>
  Promise.all(
    registrations
      .filter((r) => !r.reserveNotified)
      .map(({ eventId, id }) =>
        dynamoDB.update(
          { eventId, id },
          'set #field = :value',
          {
            '#field': 'reserveNotified',
          },
          {
            ':value': true,
          }
        )
      )
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
