import { useSetRecoilState } from 'recoil'

import { getDog } from '../../../api/dog'

import { dogAtom } from './atoms'

export function useDogActions(regNo: string) {
  const setDog = useSetRecoilState(dogAtom(regNo))
  return {
    refresh: async () => {
      const dog = await getDog(regNo, true)
      if (dog.regNo === regNo) {
        setDog(dog)
      }
    },
  }
}
