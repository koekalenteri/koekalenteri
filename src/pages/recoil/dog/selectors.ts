import { selector } from 'recoil'

import { validateRegNo } from '../../../lib/validation'

import { dogCacheAtom } from './atoms'

export const cachedDogRegNumbersSelector = selector<string[]>({
  key: 'cachedDogRegNumbers',
  get: ({ get }) => Object.keys(get(dogCacheAtom) ?? {}).filter(validateRegNo),
})
