import type { RegistrationClass, RegistrationTime } from '../../../../types'
import { atom } from 'jotai'
import { adminEventTypesRemoteAtom } from './remoteAtoms'

export const adminEventTypesAtom = adminEventTypesRemoteAtom
export const adminEventTypeFilterAtom = atom('')
export const adminEventTypeClassesAtom = atom<Record<string, RegistrationClass[]>>({
  'NOME-A': [],
  'NOME-A SM': [],
  'NOME-B': ['ALO', 'AVO', 'VOI'],
  'NOME-B SM': ['VOI'],
  NOU: [],
  NOWT: ['ALO', 'AVO', 'VOI'],
  'NOWT SM': ['VOI'],
  unofficialEvents: ['ALO', 'AVO', 'VOI'],
})
export const adminEventTypeGroupsByTypeAtom = atom<Record<string, RegistrationTime[]>>({
  NKM: ['kp'],
  'NOME-A': ['kp'],
  'NOME-A SM': ['kp'],
  'NOME-B': ['ap', 'ip', 'kp'],
  'NOME-B SM': ['ap', 'ip', 'kp'],
  NOU: ['ap', 'ip', 'kp'],
  NOWT: ['kp'],
  'NOWT SM': ['kp'],
  unofficialEvents: ['ap', 'ip', 'kp'],
})
