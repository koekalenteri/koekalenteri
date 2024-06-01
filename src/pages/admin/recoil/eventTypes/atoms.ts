import type { EventType, RegistrationClass, RegistrationTime } from '../../../../types'

import { atom } from 'recoil'

import { localStorageEffect, logEffect } from '../../../recoil/effects'

import { adminRemoteEventTypesEffect } from './effects'

export const adminEventTypesAtom = atom<EventType[]>({
  key: 'adminEventTypes',
  default: [],
  effects: [logEffect, localStorageEffect, adminRemoteEventTypesEffect],
})

export const adminEventTypeFilterAtom = atom<string>({
  key: 'adminEventTypeFilter',
  default: '',
})

export const adminEventTypeClassesAtom = atom<Record<string, RegistrationClass[]>>({
  key: 'adminEventTypeClasses',
  default: {
    unofficialEvents: ['ALO', 'AVO', 'VOI'],
    NOU: [],
    'NOME-B': ['ALO', 'AVO', 'VOI'],
    'NOME-A': [],
    NOWT: ['ALO', 'AVO', 'VOI'],
  },
})

export const adminEventTypeGroupsAtom = atom<Record<string, RegistrationTime[]>>({
  key: 'adminEventTypeGroups',
  default: {
    unofficialEvents: ['ap', 'ip', 'kp'],
    NOU: ['ap', 'ip', 'kp'],
    'NOME-B': ['ap', 'ip', 'kp'],
    'NOME-A': ['kp'],
    NOWT: ['kp'],
    NKM: ['kp'],
  },
})
