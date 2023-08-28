import type { EventType, RegistrationClass } from 'koekalenteri-shared/model'

import { atom } from 'recoil'

import { logEffect, storageEffect } from '../effects'

import { remoteEventTypesEffect } from './effects'

export const eventTypesAtom = atom<EventType[]>({
  key: 'eventTypes',
  default: [],
  effects: [logEffect, storageEffect, remoteEventTypesEffect],
})

export const eventTypeFilterAtom = atom<string>({
  key: 'eventTypeFilter',
  default: '',
})

export const eventTypeClassesAtom = atom<Record<string, RegistrationClass[]>>({
  key: 'eventTypeClasses',
  default: {
    NOU: [],
    'NOME-B': ['ALO', 'AVO', 'VOI'],
    'NOME-A': [],
    NOWT: ['ALO', 'AVO', 'VOI'],
  },
})
