import type { Dog, ManualTestResult, RegistrationBreeder, RegistrationPerson } from '../../../types'
import { atom, atomFamily } from 'recoil'
import { logEffect } from '../effects'
import { localStorageEffect } from '../effects/storage'

type DogCachedBasePerson = Omit<RegistrationPerson, 'membership'>
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
  manual?: boolean
}

export type DogCache = Record<string, Partial<DogCachedInfo>>

export const dogCacheAtom = atom<DogCache>({
  default: {},
  effects: [localStorageEffect],
  key: 'dog-cache',
})

export const dogAtom = atomFamily<Dog | undefined, string>({
  default: undefined,
  effects: [logEffect],
  key: 'dog/regNo',
})
