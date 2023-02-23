import { useCallback } from 'react'
import { DeepPartial } from 'koekalenteri-shared/model'

import { DogCachedInfo } from '../../../recoil/dog'

import { useDogCache } from './useDogCache'

type CacheKey = keyof DogCachedInfo;
type KeySetter<K extends CacheKey> = (props: DeepPartial<DogCachedInfo[K]>) => DeepPartial<DogCachedInfo[K]>|undefined
type KeyHookResult<K extends CacheKey> = [DeepPartial<DogCachedInfo[K]>|undefined, KeySetter<K>]

/**
 * Hook for using partial dog cache.
 * @note The setter will replace the cache in this key (as opposed to merging with existing data)
 * @param regNo - Dog registration number
 * @param key - Cache key, one of: breeder, dog, handler, owner, results
 */
export function useDogCacheKey<K extends CacheKey>(regNo: string|undefined, key: K): KeyHookResult<K> {
  const [cache, setCache] = useDogCache(regNo)
  const setCached = useCallback<KeySetter<K>>((props) => {
    const cached = setCache({[key]: props})
    return cached?.[key]
  }, [key, setCache])

  return [cache?.[key], setCached]
}
