import type {
  AdminDataCollection,
  JsonConfirmedEvent,
  JsonDogEvent,
  JsonPublicDogEvent,
  JsonRegistration,
  Patch,
} from '../../../types'
import type { EventChange } from '../event'
import type { WebSocketConnection } from './types'
import { sanitizeDogEvent } from '../../../lib/event'
import { mapWithConcurrency } from '../../../lib/utils'
import { bumpDataVersion } from '../dataVersions'
import { logger } from '../log'
import { broadcast } from './broadcast'
import { removeConnection } from './connectionRepository'
import {
  adminAudience,
  eventAudience,
  organizerAudience,
  publicAudience,
  registrationsAudience,
} from './connectionSelectors'
import { bestEffort } from './livePush'
import {
  buildEventPatchPayload,
  buildEventViewersPayload,
  buildRegistrationPatchPayload,
  toEventViewers,
} from './payloads'
import { sendPublicStartList } from './publicStartList'

// Every publisher exported here is best effort (`bestEffort` in livePush.ts): it never rejects. The
// `...Strict` ones run the same push and reject when it fails, for a durable workflow that retries.

type PublicEventPatch = Patch<JsonPublicDogEvent> & { eventId: string }
type AdminEventPatch = Patch<JsonDogEvent> & { eventId: string }

const send = <T>(args: Omit<Parameters<typeof broadcast<T>>[0], 'onGoneConnection'>) =>
  broadcast<T>({
    ...args,
    onGoneConnection: async (id) => {
      await removeConnection(id)
    },
  })

const sendPublicEvent = (patch: PublicEventPatch, excludeConnectionIds: readonly string[]) =>
  send({
    audience: async () =>
      (await publicAudience()).filter((connection) => !excludeConnectionIds.includes(connection.connectionId)),
    buildPayload: () => ({ scope: 'public:event-patch', ...buildEventPatchPayload(patch.eventId, patch) }),
  })

export const publishPublicEvent = (patch: PublicEventPatch, excludeConnectionIds: string[] = []) =>
  bestEffort('public event patch', () => sendPublicEvent(patch, excludeConnectionIds))

const sendAdminEventPatch = (patch: AdminEventPatch, organizerId: string) =>
  send({
    audience: () => organizerAudience(organizerId, patch.eventId),
    buildPayload: () => ({ scope: 'admin:event-patch', ...buildEventPatchPayload(patch.eventId, patch) }),
  })

export const publishAdminEventPatch = (patch: AdminEventPatch, organizerId: string) =>
  bestEffort('admin event patch', () => sendAdminEventPatch(patch, organizerId))

/** The public half of an admin event patch, or undefined when no public field changed. */
const publicHalfOf = (patch: AdminEventPatch): PublicEventPatch | undefined => {
  const {
    eventId: _eventId,
    id: _id,
    ...publicPatch
  } = sanitizeDogEvent(patch) as Patch<JsonPublicDogEvent> & {
    eventId?: string
  }
  return Object.keys(publicPatch).length > 0 ? { eventId: patch.eventId, ...publicPatch } : undefined
}

const connectionIdsOf = (connections: WebSocketConnection[]) => connections.map((connection) => connection.connectionId)

/**
 * The full patch to the organizer's admins, and its sanitized public half to every other open page.
 * The halves fail apart: when the admins cannot be looked up or sent to, the public half still goes,
 * to the admins too (they read the same fields twice), so no open page misses a save's entries,
 * classes or state.
 */
export const publishEventPatch = async (patch: AdminEventPatch, organizerId: string) => {
  let adminConnectionIds: string[] = []
  await bestEffort('admin event patch', async () => {
    const admins = connectionIdsOf(await organizerAudience(organizerId, patch.eventId))
    await sendAdminEventPatch(patch, organizerId)
    adminConnectionIds = admins
  })

  const publicPatch = publicHalfOf(patch)
  if (publicPatch) await publishPublicEvent(publicPatch, adminConnectionIds)
}

/** The same push for a durable workflow: rejects when a lookup fails. */
const publishEventPatchStrict = async (patch: AdminEventPatch, organizerId: string) => {
  const adminConnectionIds = connectionIdsOf(await organizerAudience(organizerId, patch.eventId))
  await sendAdminEventPatch(patch, organizerId)

  const publicPatch = publicHalfOf(patch)
  if (publicPatch) await sendPublicEvent(publicPatch, adminConnectionIds)
}

const sendRegistrationPatches = (eventId: string, patch: Patch<JsonRegistration>[], organizerId: string) =>
  send({
    audience: () => organizerAudience(organizerId, eventId),
    buildPayload: () => ({ scope: 'admin:event-registrations', ...buildRegistrationPatchPayload(eventId, patch) }),
  })

export const publishRegistrationPatches = (eventId: string, patch: Patch<JsonRegistration>[], organizerId: string) =>
  bestEffort('registration patches', () => sendRegistrationPatches(eventId, patch, organizerId))

/** Durable workflows must not mark publication complete after a failed lookup or send. */
export const publishRegistrationPatchesStrict = async (
  eventId: string,
  patch: Patch<JsonRegistration>[],
  organizerId: string
) => {
  const counts = await sendRegistrationPatches(eventId, patch, organizerId)
  if (counts.failed > 0) {
    throw new Error(`Failed to publish registration patches to ${counts.failed} WebSocket connection(s)`)
  }
  return counts
}

/** How many registrations' patches are built at once: each may read its row and open payments. */
const PARTICIPANT_PATCH_CONCURRENCY = 10

type ParticipantPatchBuilder = (registrationId: string) => Promise<Patch<JsonRegistration> | undefined>

/** One registration's patch to its own pages. A failure is logged and ends only this registration. */
const sendParticipantPatch = async (
  eventId: string,
  registrationId: string,
  watching: WebSocketConnection[],
  buildPatch: ParticipantPatchBuilder
) => {
  try {
    const patch = await buildPatch(registrationId)
    if (!patch) return
    await send({
      audience: () => Promise.resolve(watching.filter((connection) => connection.registrationId === registrationId)),
      buildPayload: () => ({ eventId, patch, registrationId, scope: 'participant:registration-patch' }),
    })
  } catch (error) {
    logger.error('participant patch failed', { error, eventId, registrationId })
  }
}

/**
 * The entrants' patches for several registrations of one event (KOE-1553). The connections are
 * scanned once, and a patch is built only for a registration whose page is open, so a change to many
 * rows costs one scan and a build per watched row. `buildPatch` answers undefined when there is
 * nothing to send. A failed build or send ends only that registration's patch; the others still get
 * theirs.
 */
export const publishParticipantRegistrationPatches = (
  eventId: string,
  registrationIds: readonly string[],
  buildPatch: ParticipantPatchBuilder
) =>
  bestEffort('participant registration patches', async () => {
    if (registrationIds.length === 0) return
    const watching = await registrationsAudience(eventId, registrationIds)
    const watched = [...new Set(watching.map((connection) => connection.registrationId))]

    await mapWithConcurrency(watched, PARTICIPANT_PATCH_CONCURRENCY, (registrationId) =>
      sendParticipantPatch(eventId, registrationId, watching, buildPatch)
    )
  })

/**
 * Bumps the stored versions, then tells the admins' open pages to refetch. The bump is a stored write
 * and the only signal a browser that is not connected right now gets (at its next login), so it is
 * not best effort: a failed bump rejects. Only the push after it is. `users` is deliberately not
 * bumped here: its version is scoped per organization and bumped where the records are written
 * (lib/user.ts), which is also where the old and new scopes of a moved record are known.
 */
export const publishAdminDataInvalidation = async (collections: AdminDataCollection[]) => {
  for (const collection of collections) {
    if (collection !== 'users') await bumpDataVersion(collection)
  }

  await bestEffort('admin data invalidation', () =>
    send({
      audience: adminAudience,
      buildPayload: () => ({ collections, scope: 'admin:data-invalidation' }),
    })
  )
}

export const publishEventViewers = (
  eventId: string,
  organizerId: string,
  options: { excludeConnectionId?: string; include?: WebSocketConnection } = {}
) =>
  bestEffort('event viewers', () =>
    send({
      audience: () => eventAudience(eventId, organizerId, options),
      buildPayload: (audience) => buildEventViewersPayload(eventId, toEventViewers(audience)),
    })
  )

/** The published start list to the readers watching it (`sendPublicStartList`, KOE-1358). */
export const publishPublicStartList = (eventId: string) =>
  bestEffort('public start list', () => sendPublicStartList(eventId))

/** The same push for a durable workflow: rejects when a lookup or a read fails. */
export const publishPublicStartListStrict = (eventId: string) => sendPublicStartList(eventId)

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

  if (startList) await publishPublicStartList(patch.eventId)
}

const countsPatch = ({ classes, entries, id, members, updatedAt }: JsonConfirmedEvent): AdminEventPatch => ({
  classes,
  entries,
  eventId: id,
  members,
  updatedAt,
})

/**
 * The per-class counters after registrations were recounted. The classes carry them, and the
 * patch's updatedAt marks the client's cached row current -- a public patch without them would
 * freeze stale per-class counts in place (KOE-1277).
 */
export const publishEventCounts = (event: JsonConfirmedEvent) =>
  publishEventPatch(countsPatch(event), event.organizer.id)

/** The same push for a durable workflow: rejects when a lookup fails. */
export const publishEventCountsStrict = (event: JsonConfirmedEvent) =>
  publishEventPatchStrict(countsPatch(event), event.organizer.id)
