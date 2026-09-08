import type {
  AdminDataCollection,
  JsonConfirmedEvent,
  JsonDogEvent,
  JsonPublicDogEvent,
  JsonRegistration,
  Patch,
} from '../../../types'
import type { EventChange } from '../event'
import type { CancelledRegistration } from '../payment'
import type { WebSocketConnection } from './types'
import { sanitizeDogEvent } from '../../../lib/event'
import { bumpDataVersion } from '../dataVersions'
import { broadcast } from './broadcast'
import { removeConnection } from './connectionRepository'
import {
  adminAudience,
  eventAudience,
  organizerAudience,
  publicAudience,
  registrationAudience,
} from './connectionSelectors'
import {
  buildEventPatchPayload,
  buildEventViewersPayload,
  buildRegistrationPatchPayload,
  toEventViewers,
} from './payloads'
import { publishPublicStartList } from './publicStartList'

type PublicEventPatch = Patch<JsonPublicDogEvent> & { eventId: string }
type AdminEventPatch = Patch<JsonDogEvent> & { eventId: string }

const send = <T>(args: Omit<Parameters<typeof broadcast<T>>[0], 'onGoneConnection'>) =>
  broadcast<T>({
    ...args,
    onGoneConnection: async (id) => {
      await removeConnection(id)
    },
  })

export const publishPublicEvent = (patch: PublicEventPatch, excludeConnectionIds: string[] = []) =>
  send({
    audience: async () =>
      (await publicAudience()).filter((connection) => !excludeConnectionIds.includes(connection.connectionId)),
    buildPayload: () => ({ scope: 'public:event-patch', ...buildEventPatchPayload(patch.eventId, patch) }),
  })

export const publishAdminEventPatch = (patch: AdminEventPatch, organizerId: string) =>
  send({
    audience: () => organizerAudience(organizerId, patch.eventId),
    buildPayload: () => ({ scope: 'admin:event-patch', ...buildEventPatchPayload(patch.eventId, patch) }),
  })

export const publishEventPatch = async (patch: AdminEventPatch, organizerId: string) => {
  const adminRecipients = await organizerAudience(organizerId, patch.eventId)

  await publishAdminEventPatch(patch, organizerId)

  const publicFromSanitized = sanitizeDogEvent(patch)
  const {
    eventId: _eventId,
    id: _id,
    ...publicPatch
  } = publicFromSanitized as Patch<JsonPublicDogEvent> & {
    eventId?: string
  }

  if (Object.keys(publicPatch).length > 0) {
    const adminConnectionIds = adminRecipients.map((connection) => connection.connectionId)
    await publishPublicEvent({ eventId: patch.eventId, ...publicPatch }, adminConnectionIds)
  }
}

export const publishRegistrationPatches = (eventId: string, patch: Patch<JsonRegistration>[], organizerId: string) =>
  send({
    audience: () => organizerAudience(organizerId, eventId),
    buildPayload: () => ({ scope: 'admin:event-registrations', ...buildRegistrationPatchPayload(eventId, patch) }),
  })

/** Durable workflows must not mark publication complete after a failed send. */
export const publishRegistrationPatchesStrict = async (
  eventId: string,
  patch: Patch<JsonRegistration>[],
  organizerId: string
) => {
  const counts = await publishRegistrationPatches(eventId, patch, organizerId)
  if (counts.failed > 0) {
    throw new Error(`Failed to publish registration patches to ${counts.failed} WebSocket connection(s)`)
  }
  return counts
}

export const publishParticipantRegistrationPatch = (
  eventId: string,
  registrationId: string,
  patch: Patch<JsonRegistration>
) =>
  send({
    audience: () => registrationAudience(eventId, registrationId),
    buildPayload: () => ({ eventId, patch, registrationId, scope: 'participant:registration-patch' }),
  })

export const publishAdminDataInvalidation = async (collections: AdminDataCollection[]) => {
  // Bump the stored versions too, so a browser that is not connected right now notices at its next
  // login. `users` is deliberately excluded: its version is scoped per organization and bumped
  // where the records are written (lib/user.ts), which is also where the old and new scopes of a
  // moved record are known.
  for (const collection of collections) {
    if (collection !== 'users') await bumpDataVersion(collection)
  }

  return send({
    audience: adminAudience,
    buildPayload: () => ({ collections, scope: 'admin:data-invalidation' }),
  })
}

export const publishEventViewers = (
  eventId: string,
  organizerId: string,
  options: { excludeConnectionId?: string; include?: WebSocketConnection } = {}
) =>
  send({
    audience: () => eventAudience(eventId, organizerId, options),
    buildPayload: (audience) => buildEventViewersPayload(eventId, toEventViewers(audience)),
  })

/**
 * Sends on what the domain says changed about an event. The domain decides who may see it and
 * whether the published start list moved with it; this only carries it.
 */
export const publishEventChange = async ({ audience, organizerId, patch, startList }: EventChange) => {
  if (audience === 'admin') {
    await publishAdminEventPatch(patch, organizerId)
  } else {
    await publishEventPatch(patch, organizerId)
  }

  if (startList) await publishPublicStartList(startList)
}

/**
 * The per-class counters after registrations were recounted. The classes carry them, and the
 * patch's updatedAt marks the client's cached row current -- a public patch without them would
 * freeze stale per-class counts in place (KOE-1277).
 */
export const publishEventCounts = ({ classes, entries, id, members, organizer, updatedAt }: JsonConfirmedEvent) =>
  publishEventPatch({ classes, entries, eventId: id, members, updatedAt }, organizer.id)

/**
 * A registration whose payment or refund was cancelled reaches two audiences: the organizer's
 * admins watching the event, and the entrant looking at their own registration.
 */
export const publishCancelledRegistration = async ({
  eventId,
  organizerId,
  patch,
  registrationId,
}: CancelledRegistration) => {
  await publishRegistrationPatches(eventId, [patch], organizerId)
  await publishParticipantRegistrationPatch(eventId, registrationId, patch)
}
