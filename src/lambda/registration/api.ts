// Registration module outbound port definitions and concrete adapters.
//
// These interfaces isolate registration actions from concrete websocket and
// stats infrastructure so collaborators can be injected and tested without
// real I/O.
//
// The concrete adapters at the bottom of this file wire the port interfaces
// to the existing infrastructure implementations.

import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import { GROUP_KEY_RESERVE } from '../../lib/registration'
import { syncEventAggregates } from '../event/actions'
import { eventRepository } from '../event/repository'
import { LambdaError } from '../lib/lambda'
import { sendTemplatedEmailToEventRegistrations, updateReserveNotified } from '../lib/registration'
import { recordRegistrationChange } from '../stats/api'
import { publishRegistrationPatches } from '../ws/broadcastService'

// ---------------------------------------------------------------------------
// GroupChangeNotifier port
// ---------------------------------------------------------------------------

export interface GroupChangeNotifier {
  sendPickedEmails(
    confirmedEvent: JsonConfirmedEvent,
    registrations: JsonRegistration[],
    origin: string,
    username: string
  ): Promise<{ ok: string[]; failed: string[] }>
  sendInvitedEmails(
    confirmedEvent: JsonConfirmedEvent,
    registrations: JsonRegistration[],
    origin: string,
    username: string
  ): Promise<{ ok: string[]; failed: string[] }>
  sendReserveEmails(
    confirmedEvent: JsonConfirmedEvent,
    registrations: JsonRegistration[],
    origin: string,
    username: string
  ): Promise<{ ok: string[]; failed: string[] }>
  sendCancelledEmails(
    confirmedEvent: JsonConfirmedEvent,
    registrations: JsonRegistration[],
    origin: string,
    username: string
  ): Promise<{ ok: string[]; failed: string[] }>
  updateReserveNotified(registrations: JsonRegistration[]): Promise<void>
}

// ---------------------------------------------------------------------------
// Port interfaces
// ---------------------------------------------------------------------------

type PublishRegistrationChangeInput = {
  eventId: string
  organizerId: JsonConfirmedEvent['organizer']['id']
  registrations: JsonRegistration[]
}

/**
 * Outbound port for websocket publication of registration-related changes.
 * Actions use this interface; the concrete adapter is wired below.
 */
interface RegistrationPublisher {
  publishChange(input: PublishRegistrationChangeInput): Promise<void>
}

export type RecordRegistrationChangeInput = {
  event: JsonConfirmedEvent
  next: JsonRegistration
  previous?: JsonRegistration
}

/**
 * Outbound port for stats recording after a registration mutation.
 * Decouples registration actions from the stats module implementation.
 */
export interface RegistrationStatsPort {
  recordRegistrationChange(input: RecordRegistrationChangeInput): Promise<void>
}

/**
 * Outbound port for triggering event aggregate recalculation.
 * Registration side effects (state changes, cancellations, payments) must
 * trigger aggregate sync through this boundary rather than calling event
 * infrastructure directly.
 */
export interface SyncAggregatesPort {
  syncEventAggregates(eventId: string): Promise<{ changed: boolean; event: JsonConfirmedEvent }>
}

/**
 * Outbound port for loading confirmed events needed by registration flows.
 */
export interface EventReadPort {
  getConfirmedEvent(eventId: string): Promise<JsonConfirmedEvent>
}

// ---------------------------------------------------------------------------
// Concrete adapters
// ---------------------------------------------------------------------------

const createRegistrationPublisher = (): RegistrationPublisher => ({
  async publishChange({ eventId, organizerId, registrations }) {
    await publishRegistrationPatches(eventId, registrations, organizerId)
  },
})

const createRegistrationStatsPort = (): RegistrationStatsPort => ({
  async recordRegistrationChange({ event, next, previous }) {
    await recordRegistrationChange({ event, next, previous })
  },
})

const createSyncAggregatesPort = (): SyncAggregatesPort => ({
  async syncEventAggregates(eventId) {
    return syncEventAggregates({ eventId })
    // syncEventAggregates already returns { changed, event }
  },
})

const createEventReadPort = (): EventReadPort => ({
  async getConfirmedEvent(eventId) {
    const event = await eventRepository.getById(eventId)
    if (!event) {
      throw new LambdaError(404, `Event with id '${eventId}' was not found`)
    }
    return event
  },
})

const createGroupChangeNotifier = (): GroupChangeNotifier => ({
  async sendCancelledEmails(confirmedEvent, registrations, origin, username) {
    return sendTemplatedEmailToEventRegistrations(
      'registration',
      confirmedEvent,
      registrations,
      origin,
      '',
      username,
      'cancel'
    )
  },
  async sendInvitedEmails(confirmedEvent, registrations, origin, username) {
    return sendTemplatedEmailToEventRegistrations('invitation', confirmedEvent, registrations, origin, '', username, '')
  },
  async sendPickedEmails(confirmedEvent, registrations, origin, username) {
    return sendTemplatedEmailToEventRegistrations('picked', confirmedEvent, registrations, origin, '', username, '')
  },
  async sendReserveEmails(confirmedEvent, registrations, origin, username) {
    return sendTemplatedEmailToEventRegistrations(
      GROUP_KEY_RESERVE,
      confirmedEvent,
      registrations,
      origin,
      '',
      username,
      ''
    )
  },
  async updateReserveNotified(registrations) {
    await updateReserveNotified(registrations)
  },
})

// ---------------------------------------------------------------------------
// Singleton instances for production use
// ---------------------------------------------------------------------------

const _registrationPublisher = createRegistrationPublisher()
export const registrationStatsPort = createRegistrationStatsPort()
export const syncAggregatesPort = createSyncAggregatesPort()
export const eventReadPort = createEventReadPort()
export const groupChangeNotifier = createGroupChangeNotifier()
