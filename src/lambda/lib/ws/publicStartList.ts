import type { JsonPublicRegistration } from '../../../types'
import { isStartListAvailable } from '../../../lib/event'
import { getEvent } from '../event'
import { getRegistrationsByEventId } from '../registration'
import { buildPublicStartList } from '../startList'
import { broadcast } from './broadcast'
import { removeConnection } from './connectionRepository'
import { publicStartListAudience } from './connectionSelectors'

// API Gateway drops a WebSocket message over 128 KiB. A large trial's start list stays well under
// that, but rather than lose the update for the one trial that does not, an oversized message
// degrades into a request to fetch the list again.
const MAX_MESSAGE_BYTES = 120_000

const PUBLIC_START_LIST_SCOPE = 'public:start-list'

export const buildPublicStartListPayload = (
  eventId: string,
  participants: JsonPublicRegistration[],
  version: number
) => {
  const payload = { eventId, participants, scope: PUBLIC_START_LIST_SCOPE, version }
  if (Buffer.byteLength(JSON.stringify(payload)) <= MAX_MESSAGE_BYTES) return payload

  return { eventId, scope: PUBLIC_START_LIST_SCOPE, stale: true, version }
}

/**
 * Sends the published start list to the readers watching this event (KOE-1358). The rows are
 * composed here, on the server, from the same builder the public fetch uses, so nothing beyond the
 * published truth leaves the Lambda.
 *
 * The subscriber lookup comes first, so an event nobody is watching costs the query and nothing
 * else. Then the event and its registrations are read again, consistently: the caller's copy was
 * read before its own write, and a save that ran beside it may have changed what is published
 * since (KOE-1516).
 *
 * Two senders working at once can deliver in either order, so every message carries `version`, the
 * server time taken just before those reads. A reader keeps the highest version it has seen: the
 * highest one read after every write that has a broadcast behind it.
 */
export const publishPublicStartList = async (eventId: string) => {
  const audience = await publicStartListAudience(eventId)
  if (!audience.length) return { attempted: 0, failed: 0, gone: 0, sent: 0 }

  const version = Date.now()
  const confirmedEvent = await getEvent(eventId, { consistent: true })
  const items = await getRegistrationsByEventId(eventId, true)
  // A start list that is not available is published as empty rather than skipped: unpublishing has
  // to take the rows away from the readers who already have them.
  const participants = isStartListAvailable(confirmedEvent) ? buildPublicStartList(confirmedEvent, items) : []
  const payload = buildPublicStartListPayload(eventId, participants, version)

  return broadcast({
    audience: () => Promise.resolve(audience),
    buildPayload: () => payload,
    onGoneConnection: async (id) => {
      await removeConnection(id)
    },
  })
}
