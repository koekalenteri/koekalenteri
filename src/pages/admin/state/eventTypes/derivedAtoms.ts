import type { Language, RegistrationTime } from '../../../../types'
import i18next from 'i18next'
import { atom } from 'jotai'
import { unwrap } from 'jotai/utils'
import { atomFamily } from 'jotai-family'
import { OFFICIAL_EVENT_TYPES } from '../../../../lib/event'
import { adminEventTypeFilterAtom, adminEventTypeGroupsByTypeAtom, adminEventTypesAtom } from './atoms'

export const adminActiveEventTypesAtom = atom(async (get) =>
  (await get(adminEventTypesAtom)).filter((eventType) => eventType.active)
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
