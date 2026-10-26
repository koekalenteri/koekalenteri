import type { Language, RegistrationTime } from '@/types'
import i18next from 'i18next'
import { atom } from 'jotai'
import { unwrap } from 'jotai/utils'
import { atomFamily } from 'jotai-family'
import { OFFICIAL_EVENT_TYPES } from '@/lib/event'
import { mapMaybe } from '@/lib/maybePromise'
import { adminEventTypeFilterAtom, adminEventTypeGroupsByTypeAtom, adminEventTypesAtom } from './atoms'

// Not an `async` getter: the event form and the stats page read this, and a list that changed under
// them would then suspend the page and swap it for its Suspense fallback.
export const adminActiveEventTypesAtom = atom((get) =>
  mapMaybe(get(adminEventTypesAtom), (eventTypes) => eventTypes.filter((eventType) => eventType.active))
)

// unwrap keeps serving the previous list synchronously while a new filter/data promise settles,
// instead of re-suspending (and remounting the page) on every filter keystroke.
export const adminFilteredEventTypesAtom = unwrap(
  atom(async (get) => {
    const filter = get(adminEventTypeFilterAtom).toLocaleLowerCase(i18next.language)
    const list = await get(adminEventTypesAtom)

    if (!filter) {
      return list
    }
    return list.filter((eventType) =>
      [eventType.eventType, eventType.description[i18next.language as Language]]
        .join(' ')
        .toLocaleLowerCase(i18next.language)
        .includes(filter)
    )
  }),
  (prev) => prev ?? []
)

export const adminEventTypeGroupsAtom = atomFamily((eventType: string | undefined) =>
  atom((get): RegistrationTime[] => {
    if (!eventType) return []
    const groups = get(adminEventTypeGroupsByTypeAtom)

    return OFFICIAL_EVENT_TYPES.includes(eventType) ? (groups[eventType] ?? []) : groups.unofficialEvents
  })
)
