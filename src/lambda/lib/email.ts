import type { SendTemplatedEmailRequest } from 'aws-sdk/clients/ses'
import type { EmailTemplateId, Language } from '../../types'

import AWS from 'aws-sdk'

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
