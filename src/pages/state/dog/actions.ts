import type { DeepPartial, Dog } from '@/types'
import type { DogCachedInfo } from './atoms'
import { useAtom } from 'jotai'
import { useSnackbar } from 'notistack'
import { getDog } from '@/api/dog'
import { errorSnackbarOptions } from '@/lib/client/snackbar'
import { emptyDog } from '@/lib/data'
import { getChanges, hasChanges, merge } from '@/lib/utils'
import { useDogCache } from '../../components/registrationForm/hooks/useDogCache'
import { dogAtom } from './atoms'

const INIT_CACHE: DeepPartial<DogCachedInfo> = { owner: { ownerHandles: true, ownerPays: true } }
const isErrObject = (err: unknown): err is object => typeof err === 'object'

export function useDogActions(regNo: string) {
  const [dog, setDog] = useAtom(dogAtom(regNo))
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
        enqueueSnackbar('Koiran tietojen haku epäonnistui 😞', errorSnackbarOptions)
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
        enqueueSnackbar('Koiran tietojen päivitys epäonnistui 😞', errorSnackbarOptions)
        return applyCache(regNo, cache, dog)
      }
    },
    updateCache: (props: DeepPartial<DogCachedInfo>) => {
      const newCache = merge(cache ?? INIT_CACHE, props)
      const newCacheDog = getChanges(dog ?? {}, newCache.dog ?? {})
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
  const result: DeepPartial<DogCachedInfo> = { ...cache, dog }

  if (dog) {
    // when we have some official info
    // Cached user edits for titles, rfid, dob, sire, and dam override official KL information
    const overrides: DeepPartial<Dog> = {}

    if (cache?.dog?.titles) {
      overrides.titles = cache.dog.titles
    }
    // The chip is the user's to type on a dog entered by hand or one Kennelliitto has no chip for. A
    // chip typed while Kennelliitto had none gives way once it has one: the field is locked then, and
    // a stale typed chip would be one nobody can correct (KOE-1650).
    const rfidEditable = Boolean(cache?.manual) || !dog.rfid
    if (cache?.dog?.rfid && rfidEditable) {
      overrides.rfid = cache.dog.rfid
    }
    if (cache?.dog?.dob) {
      overrides.dob = cache.dog.dob
    }

    const damName = cache?.dog?.dam?.name || oldInfo?.dam?.name
    const damTitles = cache?.dog?.dam?.titles || oldInfo?.dam?.titles
    if (damName || damTitles) {
      overrides.dam = { name: damName, titles: damTitles }
    }

    const sireName = cache?.dog?.sire?.name || oldInfo?.sire?.name
    const sireTitles = cache?.dog?.sire?.titles || oldInfo?.sire?.titles
    if (sireName || sireTitles) {
      overrides.sire = { name: sireName, titles: sireTitles }
    }

    result.dog = merge<DeepPartial<Dog>>(dog, overrides)
    result.dog.rfidEditable = rfidEditable
  } else {
    result.dog = cache?.dog ? { ...cache.dog, regNo } : { regNo }
    result.dog.rfidEditable = Boolean(cache?.manual)
  }

  return result
}
