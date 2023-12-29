import type { EventType, RegistrationClass, RegistrationTime } from '../../../../types'

import { atom } from 'recoil'

import { logEffect, storageEffect } from '../../../recoil/effects'

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
    unofficialEvents: ['ALO', 'AVO', 'VOI'],
    NOU: [],
    'NOME-B': ['ALO', 'AVO', 'VOI'],
    'NOME-A': [],
    NOWT: ['ALO', 'AVO', 'VOI'],
  },
})

export const eventTypeGroupsAtom = atom<Record<string, RegistrationTime[]>>({
  key: 'eventTypeGroups',
  default: {
    unofficialEvents: ['ap', 'ip', 'kp'],
    NOU: ['ap', 'ip', 'kp'],
    'NOME-B': ['ap', 'ip', 'kp'],
    'NOME-A': ['kp'],
    NOWT: ['kp'],
    NKM: ['kp'],
  },
})
