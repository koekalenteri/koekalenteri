import { Dog } from "koekalenteri-shared/model"
import { DefaultValue, selectorFamily } from "recoil"

import { dogAtom, dogCacheAtom, DogCachedInfo } from "./atoms"

export const dogSelector = selectorFamily<Dog & Partial<DogCachedInfo> | undefined, string>({
  key: 'dog/regNo',
  get: regNo => ({ get }) => {
    const dog = get(dogAtom(regNo))
    if (!dog) {
      return
    }
    const cached = get(dogCacheAtom).find(dog => dog.regNo === regNo)
    return {...cached, ...dog}
  },
  set: regNo => ({ get, set }, value) => {
    const cache = get(dogCacheAtom)
    const index = cache.findIndex(dog => dog.regNo === regNo)
    const insert = index === -1
    if (!value || value instanceof DefaultValue) {
      if (insert) {
        return
      }
      cache.splice(index, 1)
    } else {
      cache.splice(insert ? cache.length : index, insert ? 0 : 1, {
        breeder: value.breeder,
        callingName: value.callingName,
        dam: value.dam,
        handler: value.handler,
        owner: value.owner,
        ownerHandles: !!value.ownerHandles,
        regNo: value.regNo,
        sire: value.sire,
        titles: value.titles,
      })
    }
    set(dogCacheAtom, [...cache])
  },
})

