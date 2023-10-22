import { selector } from 'recoil'

import { validateRegNo } from '../../components/registrationForm/validation'

import { dogCacheAtom } from './atoms'

export const cachedDogRegNumbersSelector = selector<string[]>({
  key: 'cachedDogRegNumbers',
  get: ({ get }) => Object.keys(get(dogCacheAtom) ?? {}).filter(validateRegNo),
})
