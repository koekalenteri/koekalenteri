import type { Dog, ManualTestResult, RegistrationBreeder, RegistrationPerson } from 'koekalenteri-shared/model'

import { atom, atomFamily } from 'recoil'

import { logEffect } from '../effects'
import { storageEffect } from '../effects/storage'

export interface DogCachedInfo {
  breeder: RegistrationBreeder
  dog: Dog
  handler: RegistrationPerson
  owner: RegistrationPerson & { ownerHandles: boolean }
  results: ManualTestResult[]
  rfid: boolean
}

export type DogCache = Record<string, Partial<DogCachedInfo>>

export const dogCacheAtom = atom<DogCache>({
  key: 'dog-cache',
  default: {},
  effects: [storageEffect],
})

export const dogAtom = atomFamily<Dog | undefined, string>({
  key: 'dog/regNo',
  default: undefined,
  effects: [logEffect],
})
