import type { GridColumnVisibilityModel } from '@mui/x-data-grid'
import type { DogEvent } from '../../../../types'

import { atom } from 'recoil'

import { newEventEntryEndDate, newEventEntryStartDate, newEventStartDate } from '../../../../lib/event'
import { localStorageEffect, logEffect, sessionStorageEffect } from '../../../recoil'

import { adminRemoteEventsEffect } from './effects'

export const adminEventsAtom = atom<DogEvent[]>({
  key: 'adminEvents',
  default: [],
  effects: [logEffect, sessionStorageEffect, adminRemoteEventsEffect],
})

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

export const adminEventColumnsAtom = atom<GridColumnVisibilityModel>({
  key: 'adminEventColumns',
  default: { id: false },
  effects: [logEffect, localStorageEffect],
})
