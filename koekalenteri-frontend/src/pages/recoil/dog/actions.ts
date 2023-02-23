import { diff } from 'deep-object-diff'
import { DeepPartial, Dog } from 'koekalenteri-shared/model'
import { useRecoilState } from 'recoil'

import { getDog } from '../../../api/dog'
import { hasChanges, merge } from '../../../utils'
import { emptyDog } from '../../components/RegistrationForm'
import { useDogCache } from '../../components/registrationForm/hooks/useDogCache'

import { dogAtom, DogCachedInfo } from './atoms'

const INIT_CACHE: DeepPartial<DogCachedInfo> = { owner: { ownerHandles: true }}

export function useDogActions(regNo: string) {
  const [dog, setDog] = useRecoilState(dogAtom(regNo))
  const [cache, setCache] = useDogCache(regNo)

  return {
    fetch: async() => {
      if (!regNo) {
        return {dog: undefined}
      }
      if (dog?.regNo === regNo) {
        return applyCache(regNo, cache, dog)
      }
      const fetched = await getDog(regNo)
      if (fetched?.regNo === regNo) {
        if (!fetched.results) {
          fetched.results = []
        }
        setDog(fetched)
        return applyCache(regNo, cache, fetched)
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
        return applyCache(regNo, cache, updated)
      }
    },
    updateCache: (props: DeepPartial<DogCachedInfo>) => {
      const newCache = merge(cache ?? INIT_CACHE, props)
      const newCacheDog = diff(dog ?? {}, newCache.dog ?? {})
      if (hasChanges(newCache?.dog, newCacheDog)) {
        console.log({newCacheDog})
        newCache.dog = newCacheDog
      }
      setCache(newCache)
      return applyCache(regNo, newCache, dog)
    },
  }
}

export function applyCache(regNo: string, cache?: DeepPartial<DogCachedInfo>, dog?: Dog) {
  const result: DeepPartial<DogCachedInfo> = { ...cache, dog }

  if (dog) {
    // when we have some official info
    result.dog = merge<DeepPartial<Dog>>({
      dam: {
        name: cache?.dog?.dam?.name,
        titles: cache?.dog?.dam?.titles,
      },
      sire: {
        name: cache?.dog?.sire?.name,
        titles: cache?.dog?.sire?.titles,
      },
    }, dog)

    // titles is the only thing that overwrites official information, when the official info is empty
    if (!result.dog.titles && cache?.dog?.titles) {
      result.dog.titles = cache.dog.titles
    }
  } else {
    result.dog = Object.assign({}, cache?.dog ?? {}, { regNo })
  }

  return result
}
