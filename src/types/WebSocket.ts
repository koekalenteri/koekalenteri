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

/**
 * What every event patch message carries beside the event's fields: the event it is about, and
 * `deleted` when the patch deletes the event. The public half needs the mark because `deletedAt`
 * is not a public field (KOE-1648).
 */
export interface EventPatchHeader {
  eventId: string
  deleted?: true
}

/** An event patch as the admin pages receive it ('admin:event-patch'). */
export type JsonEventPatch = Patch<JsonDogEvent> & EventPatchHeader

/** The public half of an event patch ('public:event-patch'): only the public fields, and the mark. */
export type JsonPublicEventPatch = Patch<JsonPublicDogEvent> & EventPatchHeader
