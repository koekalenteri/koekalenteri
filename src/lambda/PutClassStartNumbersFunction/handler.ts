import type { JsonConfirmedEvent, JsonRegistration, Patch } from '../../types'
import { audit, eventAuditKey } from '../lib/audit'
import { getEvent, lockRegistrationGroups } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { getParam, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
import { assertEntriesInClassSpace, authorizeStartNumberLink } from '../lib/startNumberLink'
import { assignStartNumbers, parseStartNumberEntries } from '../lib/startNumbers'
import { publishRegistrationPatches } from '../lib/ws/actions'
import { publishPublicStartList } from '../lib/ws/publicStartList'

/**
 * The drawn numbers from a class secretary's tokenized link (KOE-1267). The same write as the event
 * secretary's endpoint — the same lock, the same validations, the same audit trail — with two
 * differences: the write is attributed to the class rather than a user, and the link may only touch
 * its own class's dogs and its own class's numbers. Publishing stays with the event secretary; this
 * link enters the draw and nothing else.
 */
const putClassStartNumbersLambda = lambda('putClassStartNumbers', async (event) => {
  const eventId = getParam(event, 'eventId')
  const eventClass = getParam(event, 'eventClass')

  const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId)
  await authorizeStartNumberLink(event, eventId, confirmedEvent, eventClass)

  const body = parseJSONWithFallback<{ numbers?: unknown }>(event.body, {})
  const numbers = parseStartNumberEntries(body.numbers)
  if (numbers.length === 0) return response(422, 'nothing to do', event)

  const user = `Luokkasihteeri (${eventClass})`
  const releaseGroupsLock = await lockRegistrationGroups(eventId, 8)
  let patches: Patch<JsonRegistration>[] = []
  try {
    const registrations = await getRegistrationsByEventId(eventId)
    assertEntriesInClassSpace(registrations, eventClass, numbers)

    patches = await assignStartNumbers(eventId, registrations, numbers, user)
    await audit({
      auditKey: eventAuditKey(confirmedEvent),
      message: `Starttinumerot syötetty ${numbers.length} koiralle (${eventClass})`,
      user,
    })
  } finally {
    await releaseGroupsLock()
  }

  if (patches.length) {
    await publishRegistrationPatches(eventId, patches, confirmedEvent.organizer.id)
    await publishPublicStartList(confirmedEvent)
  }

  return response(200, { patches }, event)
})

export default putClassStartNumbersLambda
