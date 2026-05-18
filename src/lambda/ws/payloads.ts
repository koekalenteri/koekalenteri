import type { DeepPartial, JsonDogEvent, JsonRegistration } from '../../types'
import type { EventPatchPayload, EventViewer, RegistrationPatchPayload } from './types'

export const buildEventPatchPayload = (
  eventId: string,
  patch: Partial<Pick<JsonDogEvent, 'classes' | 'entries' | 'members'>>
): EventPatchPayload => ({ eventId, ...patch })

export const buildRegistrationPatchPayload = (
  eventId: string,
  patch: DeepPartial<JsonRegistration>[]
): RegistrationPatchPayload => ({ eventId, patch })

export const buildEventViewersPayload = (eventId: string, viewers: EventViewer[]) => ({
  eventId,
  scope: 'admin:event-viewers',
  viewers,
})

export const buildConnectionCountPayload = (count: number) => ({ count })
