import type { Language, RegistrationTime } from '../../../../types'
import i18next from 'i18next'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { OFFICIAL_EVENT_TYPES } from '../../../../lib/event'
import { adminEventTypeFilterAtom, adminEventTypeGroupsByTypeAtom, adminEventTypesAtom } from './atoms'

export const adminActiveEventTypesAtom = atom(async (get) =>
  (await get(adminEventTypesAtom)).filter((eventType) => eventType.active)
)

export const adminFilteredEventTypesAtom = atom(async (get) => {
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
})

export const adminEventTypeGroupsAtom = atomFamily((eventType: string | undefined) =>
  atom((get): RegistrationTime[] => {
    if (!eventType) return []
    const groups = get(adminEventTypeGroupsByTypeAtom)

    return OFFICIAL_EVENT_TYPES.includes(eventType) ? (groups[eventType] ?? []) : groups.unofficialEvents
  })
)
