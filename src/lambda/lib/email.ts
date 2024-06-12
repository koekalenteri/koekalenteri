import type { SendTemplatedEmailRequest } from 'aws-sdk/clients/ses'
import type {
  EmailTemplateId,
  JsonConfirmedEvent,
  JsonRegistration,
  Language,
  RegistrationTemplateContext,
} from '../../types'

import AWS from 'aws-sdk'

import { i18n } from '../../i18n/lambda'
import { getRegistrationEmailTemplateData } from '../../lib/registration'
import { CONFIG } from '../config'

const ses = new AWS.SES()

export async function sendTemplatedMail(
  template: EmailTemplateId,
  language: Language,
  from: string,
  to: string[],
  data: Record<string, unknown>
) {
  const params: SendTemplatedEmailRequest = {
    ConfigurationSetName: 'Koekalenteri',
    Destination: {
      ToAddresses: to,
    },
    Template: `${template}-${CONFIG.stackName}-${language}`,
    TemplateData: JSON.stringify(data),
    Source: from,
  }

  try {
    console.log(`Sending email ${from} -> ${to} (template=${template}) `)
    return ses.sendTemplatedEmail(params).promise()
  } catch (e) {
    console.log('Failed to send email', e)
  }
}

export function emailTo(registration: JsonRegistration) {
  const to: string[] = [registration.handler.email]
  if (registration.owner.email !== registration.handler.email) {
    to.push(registration.owner.email)
  }
  return to
}

export function registrationEmailTemplateData(
  registration: JsonRegistration,
  confirmedEvent: JsonConfirmedEvent,
  origin: string | undefined,
  context: RegistrationTemplateContext,
  text: string = ''
) {
  const t = i18n.getFixedT(registration.language)

  return getRegistrationEmailTemplateData(registration, confirmedEvent, origin, context, text, t)
}
