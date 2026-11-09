import type { RegistrationClass, RegistrationTime } from '@/types'
import { atom } from 'jotai'
import { EVENT_TYPE_CLASSES } from '@/lib/event'

export { adminEventTypesRemoteAtom as adminEventTypesAtom } from './remoteAtoms'
export const adminEventTypeFilterAtom = atom('')
/** The classes each type runs, the list the rule of a followed type's classes reads too (KOE-1718). */
export const adminEventTypeClassesAtom =
  atom<Readonly<Record<string, readonly RegistrationClass[]>>>(EVENT_TYPE_CLASSES)
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
