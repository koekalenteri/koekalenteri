import { atom } from 'jotai'
import { validateRegNo } from '../../../lib/validation'
import { dogCacheAtom } from './atoms'

export const cachedDogRegNumbersAtom = atom((get) => Object.keys(get(dogCacheAtom) ?? {}).filter(validateRegNo))
