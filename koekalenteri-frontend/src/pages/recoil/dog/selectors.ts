import { selector } from "recoil"

import { dogCacheAtom } from "./atoms"

export const cachedDogRegNumbersSelector = selector<string[]>({
  key: 'cachedDogRegNumbers',
  get: ({ get }) => Object.keys(get(dogCacheAtom)),
})
