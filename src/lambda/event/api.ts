import type { JsonConfirmedEvent, JsonDogEvent, JsonRegistration } from '../../types'
import type { EventPatch } from './repository'
import { getRegistrationsByEventId } from '../lib/registration'
import { publishAdminEventPatch, publishPublicEvent, publishRegistrationPatches } from '../ws/broadcastService'

export type EventPublisherPayload = Partial<Pick<JsonDogEvent, 'classes' | 'entries' | 'members'>> & {
  eventId: string
}

export type PublishEventChangeInput = {
  organizerId: JsonConfirmedEvent['organizer']['id']
  patch?: EventPatch
  payload: EventPublisherPayload
  exceptConnectionId?: string
}

export type PublishRegistrationPatchesInput = {
  eventId: string
  organizerId: JsonConfirmedEvent['organizer']['id']
  registrations: JsonRegistration[]
}

export interface EventPublisher {
  publishChange(input: PublishEventChangeInput): Promise<void>
  publishRegistrationPatches(input: PublishRegistrationPatchesInput): Promise<void>
}

export const createEventPublisher = (): EventPublisher => ({
  async publishChange({ organizerId, payload, exceptConnectionId }: PublishEventChangeInput) {
    await publishPublicEvent(payload, exceptConnectionId)
    await publishAdminEventPatch(payload, organizerId, exceptConnectionId)
  },
  async publishRegistrationPatches({ eventId, organizerId, registrations }: PublishRegistrationPatchesInput) {
    await publishRegistrationPatches(eventId, registrations, organizerId)
  },
})

export const eventPublisher = createEventPublisher()

export interface RegistrationReadPort {
  listByEventId(eventId: string): Promise<JsonRegistration[]>
}

export const createRegistrationReadPort = (): RegistrationReadPort => ({
  async listByEventId(eventId) {
    return getRegistrationsByEventId(eventId).then((regs) => regs ?? [])
  },
})

export const registrationReadPort = createRegistrationReadPort()
