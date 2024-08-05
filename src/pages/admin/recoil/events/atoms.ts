import type { GridColumnVisibilityModel } from '@mui/x-data-grid'
import type { DogEvent, RegistrationClass } from '../../../../types'

import { addDays, addYears, isSameDay, nextSaturday, sub } from 'date-fns'
import { atom, atomFamily, selector } from 'recoil'

import { zonedStartOfDay } from '../../../../i18n/dates'
import { uniqueClasses } from '../../../../lib/utils'
import { localStorageEffect, logEffect, sessionStorageEffect } from '../../../recoil'

import { adminRemoteEventsEffect } from './effects'
import { adminCurrentEventSelector, adminEventSelector } from './selectors'

export const adminEventsFetchedAtom = atom<number | undefined>({
  key: 'adminEventsFetched',
  default: addYears(new Date(), -1).valueOf(),
  effects: [logEffect, sessionStorageEffect],
})

export const adminEventsAtom = atom<DogEvent[]>({
  key: 'adminEvents',
  default: [],
  effects: [logEffect, sessionStorageEffect, adminRemoteEventsEffect],
})

const EntryStartWeeks = 6
const EntryEndWeeks = 3

export const defaultEntryStartDate = (eventStartDate: Date) => sub(eventStartDate, { weeks: EntryStartWeeks })
export const defaultEntryEndDate = (eventStartDate: Date) => sub(eventStartDate, { weeks: EntryEndWeeks })

export const newEventStartDate = zonedStartOfDay(nextSaturday(addDays(Date.now(), 90)))
export const newEventEntryStartDate = defaultEntryStartDate(newEventStartDate)
export const newEventEntryEndDate = defaultEntryEndDate(newEventStartDate)

export const isDetaultEntryStartDate = (date: Date | undefined, eventStartDate: Date) =>
  !date || isSameDay(defaultEntryStartDate(eventStartDate), date)
export const isDetaultEntryEndDate = (date: Date | undefined, eventStartDate: Date) =>
  !date || isSameDay(defaultEntryEndDate(eventStartDate), date)

export const adminNewEventAtom = atom<DogEvent>({
  key: 'newEvent',
  default: {
    state: 'draft',
    startDate: newEventStartDate,
    endDate: newEventStartDate,
    entryStartDate: newEventEntryStartDate,
    entryEndDate: newEventEntryEndDate,
    classes: [],
    judges: [{ id: 0, name: '', official: true }],
  } as unknown as DogEvent,
  effects: [logEffect, localStorageEffect],
})

export const adminShowPastEventsAtom = atom<boolean>({
  key: 'adminShowPastEvents',
  default: false,
  effects: [logEffect, localStorageEffect],
})

export const adminEventFilterTextAtom = atom<string>({
  key: 'adminEventFilterText',
  default: '',
  effects: [logEffect, localStorageEffect],
})

export const adminEventIdAtom = atom<string | undefined>({
  key: 'adminEventId',
  default: undefined,
  effects: [logEffect, localStorageEffect],
})

export const adminEventClassAtom = atom<RegistrationClass | string>({
  key: 'adminEventClass',
  default: selector({
    key: 'adminEventClass/default',
    get: ({ get }) => {
      const event = get(adminCurrentEventSelector)
      return uniqueClasses(event)[0]
    },
  }),
  effects: [logEffect, sessionStorageEffect],
})

export const adminEventColumnsAtom = atom<GridColumnVisibilityModel>({
  key: 'adminEventColumns',
  default: { id: false },
  effects: [logEffect, localStorageEffect],
})

/**
 * Existing event editing, edits stored to session storage
 */
export const adminEditableEventByIdAtom = atomFamily<DogEvent | undefined, string>({
  key: 'adminEditableEvent/Id',
  default: adminEventSelector,
  effects: [logEffect, sessionStorageEffect],
})
