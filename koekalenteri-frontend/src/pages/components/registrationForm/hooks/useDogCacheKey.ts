import { useCallback } from 'react'
import { DeepPartial } from 'koekalenteri-shared/model'

import { DogCachedInfo } from '../../../recoil/dog'

import { useDogCache } from './useDogCache'

type CacheKey = keyof DogCachedInfo;
type KeySetter<K extends CacheKey> = (props: DeepPartial<DogCachedInfo[K]>) => DogCachedInfo[K] | undefined;
type KeyHookResult<K extends CacheKey> = [DogCachedInfo[K] | undefined, KeySetter<K>];

export function useDogCacheKey<K extends CacheKey>(regNo: string|undefined, key: K): KeyHookResult<K> {
  const [cache, setCache] = useDogCache(regNo)
  const setCached = useCallback<KeySetter<K>>((props) => {
    const cached = setCache({[key]: props})
    return cached?.[key]
  }, [key, setCache])

  return [cache?.[key], setCached]
}
