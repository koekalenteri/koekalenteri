import type { JsonDogEvent, JsonPublicDogEvent } from './Event'
import type { Patch } from './utility'

export type AdminDataCollection =
  | 'emailTemplates'
  | 'eventTypes'
  | 'judges'
  | 'locations'
  | 'officials'
  | 'organizers'
  | 'users'

/** An event patch as the admin pages receive it ('admin:event-patch'). */
export type JsonEventPatch = Patch<JsonDogEvent> & { eventId: string }

/**
 * The public half of an event patch ('public:event-patch'): only the public fields, and `deleted`
 * when the patch deletes the event, since `deletedAt` is not a public field (KOE-1648).
 */
export type JsonPublicEventPatch = Patch<JsonPublicDogEvent> & { eventId: string; deleted?: true }
