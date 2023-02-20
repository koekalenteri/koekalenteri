import { DeepPartial } from 'koekalenteri-shared/model'
import { useRecoilState } from 'recoil'

import { getDog } from '../../../api/dog'
import { merge } from '../../../utils'
import { emptyDog } from '../../components/RegistrationForm'
import { useDogCache } from '../../components/registrationForm/hooks/useDogCache'

import { dogAtom, DogCachedInfo } from './atoms'


export function useDogActions(regNo: string) {
  const [dog, setDog] = useRecoilState(dogAtom(regNo))
  const [cache] = useDogCache(regNo)

  return {
    fetch: async() => {
      if (!regNo) {
        return {dog: undefined}
      }
      if (dog?.regNo === regNo) {
        return merge<DeepPartial<DogCachedInfo>>(cache ?? {}, {dog})
      }
      const fetched = await getDog(regNo)
      if (fetched?.regNo === regNo) {
        if (!fetched.results) {
          fetched.results = []
        }
        setDog(fetched)
        return merge<DeepPartial<DogCachedInfo>>(cache ?? {}, {dog: fetched})
      }
    },
    refresh: async () => {
      if (!regNo) {
        return {dog: emptyDog}
      }
      const updated = await getDog(regNo, true)
      if (updated.regNo === regNo) {
        if (!updated.results) {
          updated.results = []
        }
        setDog(updated)
        return merge<DeepPartial<DogCachedInfo>>(cache ?? {}, {dog: updated})
      }
    },
  }
}
