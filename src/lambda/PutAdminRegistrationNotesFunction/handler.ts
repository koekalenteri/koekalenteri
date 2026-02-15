import type { JsonRegistration } from '../../types'
import { audit, registrationAuditKey } from '../lib/audit'
import { authorize } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { updateRegistrationField } from '../lib/registration'

const putAdminRegistrationNotesLambda = lambda('putRegistrationNotes', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const { eventId, id, internalNotes }: Pick<JsonRegistration, 'eventId' | 'id' | 'internalNotes'> =
    parseJSONWithFallback(event.body)

  if (!eventId || !id) throw new Error('Event id or registration id missing')

  await updateRegistrationField(eventId, id, 'internalNotes', internalNotes)
  await audit({
    auditKey: registrationAuditKey({ eventId, id }),
    message: 'Muutti sisäistä kommenttia',
    user: user.name,
  })

  return response(200, 'ok', event)
})

export default putAdminRegistrationNotesLambda
