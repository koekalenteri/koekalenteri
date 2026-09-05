import type { JsonDogEvent, JsonPublicRegistration, JsonRegistration } from '../../../types'
import { isStartListAvailable } from '../../../lib/event'
import { getRegistrationsByEventId } from '../registration'
import { buildPublicStartList } from '../startList'
import { broadcast } from './broadcast'
import { removeConnection } from './connectionRepository'
import { publicStartListAudience } from './connectionSelectors'

// API Gateway drops a WebSocket message over 128 KiB. A large trial's start list stays well under
// that, but rather than lose the update for the one trial that does not, an oversized message
// degrades into a request to fetch the list again.
const MAX_MESSAGE_BYTES = 120_000

export const PUBLIC_START_LIST_SCOPE = 'public:start-list'

/**
 * Event fields the published start list is derived from. Every other event change reaches an open
 * reader as the broadcast public event patch and needs no rebuilt list.
 */
const START_LIST_EVENT_FIELDS = [
  'classes',
  'resultsPublished',
  'startListPublished',
  'startNumbersPublished',
  'state',
] as const

export const affectsPublicStartList = (patch: object) => START_LIST_EVENT_FIELDS.some((field) => field in patch)

export const buildPublicStartListPayload = (eventId: string, participants: JsonPublicRegistration[]) => {
  const payload = { eventId, participants, scope: PUBLIC_START_LIST_SCOPE }
  if (Buffer.byteLength(JSON.stringify(payload)) <= MAX_MESSAGE_BYTES) return payload

  return { eventId, scope: PUBLIC_START_LIST_SCOPE, stale: true }
}

/**
 * Sends the published start list to the readers watching this event (KOE-1358). The rows are
 * composed here, on the server, from the same builder the public fetch uses, so nothing beyond the
 * published truth leaves the Lambda.
 *
 * The event comes from the caller, which has just written it. The subscriber lookup comes first, so
 * an event nobody is watching costs the query and nothing else — neither the registration read nor
 * the composition.
 */
export const publishPublicStartList = async (confirmedEvent: JsonDogEvent, registrations?: JsonRegistration[]) => {
  const eventId = confirmedEvent.id
  const audience = await publicStartListAudience(eventId)
  if (!audience.length) return { attempted: 0, failed: 0, gone: 0, sent: 0 }

  const items = registrations ?? (await getRegistrationsByEventId(eventId)) ?? []
  // A start list that is not available is published as empty rather than skipped: unpublishing has
  // to take the rows away from the readers who already have them.
  const participants = isStartListAvailable(confirmedEvent) ? buildPublicStartList(confirmedEvent, items) : []
  const payload = buildPublicStartListPayload(eventId, participants)

  return broadcast({
    audience: () => Promise.resolve(audience),
    buildPayload: () => payload,
    onGoneConnection: async (id) => {
      await removeConnection(id)
    },
  })
}
