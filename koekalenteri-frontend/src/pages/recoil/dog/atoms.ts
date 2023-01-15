import { Dog, RegistrationBreeder, RegistrationPerson } from "koekalenteri-shared/model"
import { atom, atomFamily } from "recoil"

import { storageEffect } from "../effects/storage"

import { remoteDogEffect } from "./effects"

export type DogCachedInfo = {
  breeder: RegistrationBreeder,
  dog: Dog,
  handler: RegistrationPerson,
  owner: RegistrationPerson,
  ownerHandles: boolean,
}

type DogCache = Record<string, Partial<DogCachedInfo>>

export const dogCacheAtom = atom<DogCache>({
  key: 'dog-cache',
  default: {},
  effects: [
    storageEffect,
  ],
})

export const dogAtom = atomFamily<Dog|undefined, string>({
  key: 'dog/regNo',
  default: undefined,
  effects: [
    remoteDogEffect,
  ],
})
