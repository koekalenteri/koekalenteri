import type {
  Dog,
  JsonDog,
  JsonManualTestResult,
  ManualTestResult,
  RegistrationBreeder,
  RegistrationPerson,
  Replace,
} from '@/types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { arrayOf, converter, recordOf, toStoredDog, toStoredManualTestResult } from '@/lib/wire'
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

/** The cache as it sits in storage: the dog's and the results' dates as day keys, or the instants stored before. */
type JsonDogCachedInfo = Replace<Replace<DogCachedInfo, 'dog', JsonDog>, 'results', JsonManualTestResult[]>
type JsonDogCache = Record<string, Partial<JsonDogCachedInfo>>

const toDogCache = recordOf(
  converter<Partial<JsonDogCachedInfo>, Partial<DogCachedInfo>>()({
    dog: toStoredDog,
    results: arrayOf(toStoredManualTestResult),
  })
)

export const dogCacheAtom = atomWithLocalStorage<DogCache, JsonDogCache>('dog-cache', {}, { revive: toDogCache })
export const dogAtom = atomFamily((_registrationNumber: string) => atom<Dog | undefined>(undefined))
