import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import { audit, registrationAuditKey } from '../lib/audit'
import { authorizeWithMemberOf } from '../lib/auth'
import { getAuthorizedEvent } from '../lib/eventAuth'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { updateRegistrationField } from '../lib/registration'
import { publishRegistrationPatches } from '../lib/ws/actions'

const putAdminRegistrationNotesLambda = lambda('putRegistrationNotes', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

  const { eventId, id, internalNotes }: Pick<JsonRegistration, 'eventId' | 'id' | 'internalNotes'> =
    parseJSONWithFallback(event.body)

  if (!eventId || !id) throw new Error('Event id or registration id missing')

  const confirmedEvent = await getAuthorizedEvent<JsonConfirmedEvent>(user, memberOf, eventId)

  await updateRegistrationField(eventId, id, 'internalNotes', internalNotes)
  await publishRegistrationPatches(eventId, [{ id, internalNotes }], confirmedEvent.organizer.id)
  await audit({
    auditKey: registrationAuditKey({ eventId, id }),
    message: 'Muutti sisäistä kommenttia',
    user: user.name,
  })

  return response(200, 'ok', event)
})

export default putAdminRegistrationNotesLambda
