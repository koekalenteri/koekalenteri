import { useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { isOfficialEventType } from '../../../lib/event'
import { adminActiveEventTypesAtom } from '../state'

// unwrap rather than suspend: this decides whether a section renders at all, and a form must not blank
// out waiting for a list it has almost always loaded already. Until it arrives the hardcoded fallback
// list answers, which is what the whole app used before the `official` flag existed.
const eventTypesAtom = unwrap(adminActiveEventTypesAtom, (previous) => previous ?? [])

/**
 * Whether the Kennel Club knows this event type, which is what decides that an event can carry a
 * koetunnus at all. The event form's section and the results header both have to ask, and they have to
 * agree, so the lookup of the event type's `official` flag lives here rather than at either of them.
 */
export const useIsOfficialEventType = (eventType?: string): boolean => {
  const eventTypes = useAtomValue(eventTypesAtom)

  return isOfficialEventType(eventType, eventTypes.find((item) => item.eventType === eventType)?.official)
}
