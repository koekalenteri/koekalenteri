import type { JsonRegistration } from '../../types'
import { authorize } from '../auth/api'
import { CONFIG } from '../config'
import { getOrigin } from '../lib/api-gw'
import { audit, registrationAuditKey } from '../lib/audit'
import { emailTo, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { getRegistrationChanges } from '../lib/registration'
import { saveAdminRegistration } from '../registration/actions'

const { emailFrom } = CONFIG

export const putAdminRegistrationLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const timestamp = new Date().toISOString()
  const origin = getOrigin(event)

  const registration: JsonRegistration = parseJSONWithFallback(event.body)

  const result = await saveAdminRegistration({ registration, timestamp, username: user.name })

  if (result.kind === 'already-registered') {
    return response(
      409,
      {
        cancelled: result.cancelled,
        message: 'Conflict: Dog already registered to this event',
      },
      event
    )
  }

  const { data, existing, confirmedEvent } = result
  const update = !!existing

  const message = getAuditMessage(data, existing)
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
    const templateData = registrationEmailTemplateData(data, confirmedEvent, origin, context)

    await sendTemplatedMail('registration', registration.language, emailFrom, to, templateData)

    await audit({
      auditKey: registrationAuditKey(registration),
      message: `Email: ${templateData.subject}, to: ${to.join(', ')}`,
      user: user.name,
    })
  }

  return response(200, data, event)
}

function getAuditMessage(data: JsonRegistration, existing?: JsonRegistration): string {
  if (!existing) return 'Lisäsi ilmoittautumisen'

  return getRegistrationChanges(existing, data)
}

export default lambda('putAdminRegistration', putAdminRegistrationLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
