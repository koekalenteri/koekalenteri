import type { JsonConfirmedEvent, JsonRegistration, Patch, RegistrationClass } from '../../types'
import type { StartNumberEntry } from '../lib/startNumbers'
import { isStartListPublishedForClass } from '../../lib/event'
import { isRegistrationClass } from '../../lib/registration'
import { audit, eventAuditKey } from '../lib/audit'
import { authorizeWithMemberOf } from '../lib/auth'
import { lockRegistrationGroups } from '../lib/event'
import { getAuthorizedEvent } from '../lib/eventAuth'
import { parseJSONWithFallback } from '../lib/json'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { getRegistrationsByEventId } from '../lib/registration'
import { assignStartNumbers, freezeStartNumbers, setStartNumbersPublishedState } from '../lib/startNumbers'
import { publishRegistrationPatches } from '../lib/ws/actions'

interface StartNumbersRequest {
  /** Scopes a publish or a batch of numbers to one class; absent for a classless event. */
  eventClass?: string
  /** Flip the class's numbers public or hidden. Publishing is also the freeze. */
  published?: boolean
  /** The venue draw's results, written as values rather than as a reordering. */
  numbers?: StartNumberEntry[]
}

const isEntry = (value: unknown): value is StartNumberEntry =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as StartNumberEntry).id === 'string' &&
  typeof (value as StartNumberEntry).startNumber === 'number'

/**
 * The one endpoint that writes start numbers (KOE-1017, KOE-1218). Publishing freezes each
 * participant's current group into `startGroup` in the same locked request that flips the flag, so
 * the two cannot land in different states; entering drawn numbers writes the same field through the
 * same validations.
 */
const putStartNumbersLambda = lambda('putStartNumbers', async (event) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return res

  const eventId = getParam(event, 'eventId')
  const body = parseJSONWithFallback<StartNumbersRequest>(event.body, {})
  const eventClass: RegistrationClass | undefined = isRegistrationClass(body.eventClass) ? body.eventClass : undefined
  const numbers = Array.isArray(body.numbers) ? body.numbers.filter(isEntry) : []

  if (typeof body.published !== 'boolean' && numbers.length === 0) {
    return response(422, 'nothing to do', event)
  }

  const confirmedEvent = await getAuthorizedEvent<JsonConfirmedEvent>(user, memberOf, eventId)

  // Numbers ride the start list: they cannot be published for a class whose list is not public.
  if (body.published === true) {
    const listPublished = eventClass
      ? isStartListPublishedForClass(confirmedEvent, eventClass)
      : confirmedEvent.startListPublished !== false
    if (!listPublished) throw new LambdaError(422, 'Start list is not published')
  }

  const releaseGroupsLock = await lockRegistrationGroups(eventId, 8)
  const patches: Patch<JsonRegistration>[] = []
  try {
    const registrations = await getRegistrationsByEventId(eventId)

    if (typeof body.published === 'boolean') {
      if (body.published) {
        patches.push(...(await freezeStartNumbers(eventId, registrations, eventClass)))
      }
      confirmedEvent.startNumbersPublished = await setStartNumbersPublishedState(
        confirmedEvent,
        eventClass,
        body.published
      )
      await audit({
        auditKey: eventAuditKey(confirmedEvent),
        message: `Starttinumerot ${body.published ? 'julkaistu' : 'piilotettu'}${eventClass ? ` (${eventClass})` : ''}`,
        user: user.name,
      })
    }

    if (numbers.length) {
      patches.push(...(await assignStartNumbers(eventId, registrations, numbers)))
      await audit({
        auditKey: eventAuditKey(confirmedEvent),
        message: `Starttinumerot syötetty ${numbers.length} koiralle${eventClass ? ` (${eventClass})` : ''}`,
        user: user.name,
      })
    }
  } finally {
    await releaseGroupsLock()
  }

  if (patches.length) await publishRegistrationPatches(eventId, patches, confirmedEvent.organizer.id)

  return response(200, { event: confirmedEvent, patches }, event)
})

export default putStartNumbersLambda
