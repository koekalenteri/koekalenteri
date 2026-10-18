import type { WebSocketConnection } from '../lib/ws/types'

/**
 * Stand-ins for the two boundaries under `publishParticipantRegistrationPatches`, so a caller's test
 * runs the real publisher, its failure handling included (KOE-1553): every entrant named has one
 * page open, and each payload sent reaches `toEntrant`.
 */

/** The connection scan: one open page per registration asked for. */
export const everyEntrantWatching = async (
  eventId: string,
  registrationIds: readonly string[]
): Promise<WebSocketConnection[]> =>
  registrationIds.map((registrationId) => ({
    connectionId: `page-${registrationId}`,
    registrationEventId: eventId,
    registrationId,
  }))

interface ParticipantPayload {
  eventId: string
  patch: unknown
  registrationId: string
}

interface BroadcastArgs {
  audience: () => Promise<WebSocketConnection[]>
  buildPayload: (audience: WebSocketConnection[], recipient: WebSocketConnection) => ParticipantPayload
}

/** The broadcast: hands every recipient's payload to `toEntrant(eventId, registrationId, patch)`. */
export const deliverToEntrant =
  (toEntrant: (eventId: string, registrationId: string, patch: unknown) => void) =>
  async ({ audience, buildPayload }: BroadcastArgs) => {
    const recipients = await audience()
    for (const recipient of recipients) {
      const { eventId, patch, registrationId } = buildPayload(recipients, recipient)
      toEntrant(eventId, registrationId, patch)
    }
    return { attempted: recipients.length, failed: 0, gone: 0, sent: recipients.length }
  }
