import type { GridColumnVisibilityModel } from '@mui/x-data-grid'
import type { DogEvent } from '../../../../types'
import { atom } from 'recoil'
import { newEventEntryEndDate, newEventEntryStartDate, newEventStartDate } from '../../../../lib/event'
import { localStorageEffect, logEffect, sessionStorageEffect } from '../../../recoil'
import { adminRemoteEventsEffect } from './effects'

export const adminEventsAtom = atom<DogEvent[]>({
  default: [],
  effects: [logEffect, sessionStorageEffect, adminRemoteEventsEffect],
  key: 'adminEvents',
})

export const adminNewEventAtom = atom<DogEvent>({
  default: {
    classes: [],
    endDate: newEventStartDate,
    entryEndDate: newEventEntryEndDate,
    entryStartDate: newEventEntryStartDate,
    judges: [{ id: 0, name: '', official: true }],
    startDate: newEventStartDate,
    state: 'draft',
  } as unknown as DogEvent,
  effects: [logEffect, localStorageEffect],
  key: 'newEvent',
})

export const adminShowPastEventsAtom = atom<boolean>({
  default: false,
  effects: [logEffect, localStorageEffect],
  key: 'adminShowPastEvents',
})

export const adminEventFilterTextAtom = atom<string>({
  default: '',
  effects: [logEffect, localStorageEffect],
  key: 'adminEventFilterText',
})

export const adminEventIdAtom = atom<string | undefined>({
  default: undefined,
  effects: [logEffect, localStorageEffect],
  key: 'adminEventId',
})

export const adminEventColumnsAtom = atom<GridColumnVisibilityModel>({
  default: { id: false },
  effects: [logEffect, localStorageEffect],
  key: 'adminEventColumns',
})
