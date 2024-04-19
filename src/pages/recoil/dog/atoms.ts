import type { Dog, ManualTestResult, RegistrationBreeder, RegistrationPerson } from '../../../types'

import { atom, atomFamily } from 'recoil'

import { logEffect } from '../effects'
import { storageEffect } from '../effects/storage'

interface DogCachedBasePerson extends Omit<RegistrationPerson, 'membership'> {}
interface DogCachedHandlerPerson extends DogCachedBasePerson {
  membership: Record<string, boolean>
}

interface DogCachedOwnerPerson extends DogCachedBasePerson {
  ownerHandles: boolean
  ownerPays: boolean
  membership: Record<string, boolean>
}

export interface DogCachedInfo {
  breeder: RegistrationBreeder
  dog: Dog
  handler: DogCachedHandlerPerson
  owner: DogCachedOwnerPerson
  payer: RegistrationPerson
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
