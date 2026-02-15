import type { EventType, RegistrationClass, RegistrationTime } from '../../../../types'
import { atom } from 'recoil'
import { localStorageEffect, logEffect } from '../../../recoil/effects'
import { adminRemoteEventTypesEffect } from './effects'

export const adminEventTypesAtom = atom<EventType[]>({
  default: [],
  effects: [logEffect, localStorageEffect, adminRemoteEventTypesEffect],
  key: 'adminEventTypes',
})

export const adminEventTypeFilterAtom = atom<string>({
  default: '',
  key: 'adminEventTypeFilter',
})

export const adminEventTypeClassesAtom = atom<Record<string, RegistrationClass[]>>({
  default: {
    'NOME-A': [],
    'NOME-A SM': [],
    'NOME-B': ['ALO', 'AVO', 'VOI'],
    'NOME-B SM': ['VOI'],
    NOU: [],
    NOWT: ['ALO', 'AVO', 'VOI'],
    'NOWT SM': ['VOI'],
    unofficialEvents: ['ALO', 'AVO', 'VOI'],
  },
  key: 'adminEventTypeClasses',
})

export const adminEventTypeGroupsAtom = atom<Record<string, RegistrationTime[]>>({
  default: {
    NKM: ['kp'],
    'NOME-A': ['kp'],
    'NOME-A SM': ['kp'],
    'NOME-B': ['ap', 'ip', 'kp'],
    'NOME-B SM': ['ap', 'ip', 'kp'],
    NOU: ['ap', 'ip', 'kp'],
    NOWT: ['kp'],
    'NOWT SM': ['kp'],
    unofficialEvents: ['ap', 'ip', 'kp'],
  },
  key: 'adminEventTypeGroups',
})
