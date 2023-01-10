import { Dog, RegistrationBreeder, RegistrationPerson } from "koekalenteri-shared/model"
import { atom, atomFamily } from "recoil"

import { storageEffect } from "../effects/storage"

import { remoteDogEffect } from "./effects"

export type DogCachedInfo = {
  breeder: RegistrationBreeder,
  handler: RegistrationPerson,
  owner: RegistrationPerson,
  ownerHandles: boolean,
}

export const dogCacheAtom = atom<Partial<Dog & DogCachedInfo>[]>({
  key: 'dog-cachex',
  default: [],
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
