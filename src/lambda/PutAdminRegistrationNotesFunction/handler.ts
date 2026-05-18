import type { JsonRegistration } from '../../types'
import { authorize } from '../auth/api'
import { audit, registrationAuditKey } from '../lib/audit'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { updateRegistrationNotes } from '../registration/actions'

export const putAdminRegistrationNotesLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const { eventId, id, internalNotes }: Pick<JsonRegistration, 'eventId' | 'id' | 'internalNotes'> =
    parseJSONWithFallback(event.body)

  if (!eventId || !id) throw new Error('Event id or registration id missing')

  await updateRegistrationNotes({ eventId, internalNotes, registrationId: id })
  await audit({
    auditKey: registrationAuditKey({ eventId, id }),
    message: 'Muutti sisäistä kommenttia',
    user: user.name,
  })

  return response(200, 'ok', event)
}

export default lambda('putRegistrationNotes', putAdminRegistrationNotesLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
