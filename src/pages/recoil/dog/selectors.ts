import { selector } from 'recoil'
import { validateRegNo } from '../../../lib/validation'
import { dogCacheAtom } from './atoms'

export const cachedDogRegNumbersSelector = selector<string[]>({
  get: ({ get }) => Object.keys(get(dogCacheAtom) ?? {}).filter(validateRegNo),
  key: 'cachedDogRegNumbers',
})
