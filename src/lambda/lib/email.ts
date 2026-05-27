import type { MessageTag, SendTemplatedEmailCommandInput } from '@aws-sdk/client-ses'
import type {
  EmailTemplateId,
  JsonConfirmedEvent,
  JsonRegistration,
  JsonRegistrationGroup,
  Language,
  RegistrationTemplateContext,
} from '../../types'
import { SESClient, SendTemplatedEmailCommand } from '@aws-sdk/client-ses'
import { i18n } from '../../i18n/lambda'
import { getRegistrationEmailTemplateData } from '../../lib/registration'
import { CONFIG } from '../config'

const ses = new SESClient()

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export async function sendTemplatedMail(
  template: EmailTemplateId,
  language: Language,
  from: string,
  to: string[],
  data: Record<string, unknown>,
  tags?: MessageTag[]
) {
  if (to.length === 0) {
    console.log('sendTemplatedEmail: no recipients')
    return
  }
  const params: SendTemplatedEmailCommandInput = {
    ConfigurationSetName: 'Koekalenteri',
    Destination: {
      ToAddresses: to,
    },
    Source: from,
    Template: `${template}-${CONFIG.stackName}-${language}`,
    TemplateData: JSON.stringify(data),
  }
  if (tags) params.Tags = tags

  console.log(`Sending email ${from} -> ${to} (template=${template}) `)
  return ses.send(new SendTemplatedEmailCommand(params))
}

export function registrationEmailTags(registration: JsonRegistration, template: EmailTemplateId): MessageTag[] {
  return [
    { Name: 'eventId', Value: registration.eventId },
    { Name: 'registrationId', Value: registration.id },
    { Name: 'template', Value: template },
  ]
}

export function emailTo(registration: JsonRegistration) {
  const to: string[] = []
  if (registration.handler?.email) to.push(registration.handler.email)
  if (registration.owner?.email && registration.owner?.email !== registration.handler?.email) {
    to.push(registration.owner.email)
  }
  return to
}

export function registrationEmailTemplateData(
  registration: JsonRegistration,
  confirmedEvent: JsonConfirmedEvent,
  origin: string | undefined,
  context: RegistrationTemplateContext,
  text: string = '',
  previousGroup?: JsonRegistrationGroup
) {
  const t = i18n.getFixedT(registration.language)

  return getRegistrationEmailTemplateData(registration, confirmedEvent, origin, context, text, t, previousGroup)
}
