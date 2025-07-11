import type { DeepPartial, Dog } from '../../../types'
import type { DogCachedInfo } from './atoms'

import { diff } from 'deep-object-diff'
import { useSnackbar } from 'notistack'
import { useRecoilState } from 'recoil'

import { getDog } from '../../../api/dog'
import { emptyDog } from '../../../lib/data'
import { hasChanges, merge } from '../../../lib/utils'
import { useDogCache } from '../../components/registrationForm/hooks/useDogCache'

import { dogAtom } from './atoms'

const INIT_CACHE: DeepPartial<DogCachedInfo> = { owner: { ownerHandles: true, ownerPays: true } }
const isErrObject = (err: unknown): err is object => typeof err === 'object'

export function useDogActions(regNo: string) {
  const [dog, setDog] = useRecoilState(dogAtom(regNo))
  const [cache, setCache] = useDogCache(regNo)
  const { enqueueSnackbar } = useSnackbar()

  return {
    fetch: async (): Promise<DeepPartial<DogCachedInfo>> => {
      if (!regNo) {
        return { dog: emptyDog }
      }
      if (dog?.regNo === regNo || cache?.manual) {
        return applyCache(regNo, cache, dog)
      }
      try {
        const fetched = await getDog(regNo)
        if (fetched?.regNo === regNo) {
          if (!fetched.results) {
            fetched.results = []
          }
          setDog(fetched)
          return applyCache(regNo, cache, fetched)
        }
      } catch (err) {
        if (isErrObject(err) && 'status' in err) {
          if (err.status === 404) {
            return { dog: emptyDog }
          }
        }
        enqueueSnackbar('Koiran tietojen haku epäonnistui 😞', { variant: 'error' })
        throw err
      }
      return { dog: emptyDog }
    },
    refresh: async (oldInfo?: DeepPartial<Dog>): Promise<DeepPartial<DogCachedInfo> | undefined> => {
      if (!regNo) {
        return { dog: emptyDog }
      }
      try {
        const updated = await getDog(regNo, true)
        if (updated.regNo === regNo) {
          if (!updated.results) {
            updated.results = []
          }
          setDog(updated)
          return applyCache(regNo, cache, updated, oldInfo)
        }
      } catch (err) {
        console.error(err)
        enqueueSnackbar('Koiran tietojen päivitys epäonnistui 😞', { variant: 'error' })
        return applyCache(regNo, cache, dog)
      }
    },
    updateCache: (props: DeepPartial<DogCachedInfo>) => {
      const newCache = merge(cache ?? INIT_CACHE, props)
      const newCacheDog = diff(dog ?? {}, newCache.dog ?? {})
      if (hasChanges(newCache?.dog, newCacheDog)) {
        newCache.dog = newCacheDog
      }
      setCache(newCache)
      return applyCache(regNo, newCache, dog)
    },
  }
}

function applyCache(
  regNo: string,
  cache?: DeepPartial<DogCachedInfo>,
  dog?: Dog,
  oldInfo?: DeepPartial<Dog>
): DeepPartial<DogCachedInfo> {
  const result: DeepPartial<DogCachedInfo> = { ...cache, dog, rfid: false }

  if (dog) {
    // when we have some official info
    result.dog = merge<DeepPartial<Dog>>(
      {
        dam: {
          name: cache?.dog?.dam?.name || oldInfo?.dam?.name,
          titles: cache?.dog?.dam?.titles || oldInfo?.dam?.titles,
        },
        sire: {
          name: cache?.dog?.sire?.name || oldInfo?.sire?.name,
          titles: cache?.dog?.sire?.titles || oldInfo?.sire?.titles,
        },
      },
      dog
    )

    // titles and rfid are the only thing that overwrites official information, when the official info is empty
    if (!result.dog.titles && cache?.dog?.titles) {
      result.dog.titles = cache.dog.titles
    }
    if (!result.dog.rfid && cache?.dog?.rfid) {
      result.dog.rfid = cache.dog.rfid
      result.rfid = true
    }
  } else {
    result.dog = Object.assign({}, cache?.dog ?? {}, { regNo })
  }

  return result
}
