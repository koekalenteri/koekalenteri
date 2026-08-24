import type { Dog, ManualTestResult, RegistrationBreeder, RegistrationPerson } from '../../../types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { atomWithLocalStorage } from '../storage/atoms'

type DogCachedBasePerson = Omit<RegistrationPerson, 'membership'>
interface DogCachedHandlerPerson extends DogCachedBasePerson {
  membership: Record<string, boolean>
}

interface DogCachedOwnerPerson extends DogCachedBasePerson {
  key: string
  membership: Record<string, boolean>
}

interface DogCachedOwners {
  ownerHandles?: boolean | string
  ownerPays?: boolean | string
  owners: DogCachedOwnerPerson[]
}

export interface DogCachedInfo {
  breeder: RegistrationBreeder
  dog: Dog
  handler: DogCachedHandlerPerson
  owner: DogCachedOwners
  payer: RegistrationPerson
  results: ManualTestResult[]
  manual?: boolean
}

export type DogCache = Record<string, Partial<DogCachedInfo>>

export const dogCacheAtom = atomWithLocalStorage<DogCache>('dog-cache', {})
export const dogAtom = atomFamily((_registrationNumber: string) => atom<Dog | undefined>(undefined))
