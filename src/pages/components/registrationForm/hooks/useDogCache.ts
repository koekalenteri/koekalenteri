import type { DeepPartial } from '../../../../types'
import type { DogCache, DogCachedInfo } from '../../../recoil/dog'

import { useCallback, useMemo } from 'react'
import { useRecoilState } from 'recoil'

import { isEmpty } from '../../../../lib/utils'
import { validateRegNo } from '../../../../lib/validation'
import { dogCacheAtom } from '../../../recoil/dog'

type Setter = (props: DeepPartial<DogCachedInfo>) => DeepPartial<DogCachedInfo> | undefined
type HookResult = [DeepPartial<DogCachedInfo> | undefined, Setter]

/**
 * Hook for using locally stored cache dog related information.
 * @note The setter will replace (Object.assign) the provided keys to the cache.
 * @param regNo - Dog registration number
 */
export function useDogCache(regNo: string = ''): HookResult {
  const [cache, setCache] = useRecoilState(dogCacheAtom)
  const cached = useMemo(() => (regNo ? cache?.[regNo] : undefined), [cache, regNo])
  const setCached = useCallback<Setter>(
    (props) => {
      if (!validateRegNo(regNo) || isEmpty(props)) {
        return
      }
      const result = cached ? Object.assign({}, cached, props) : props
      setCache(Object.assign({}, filterInvalid(cache), { [regNo]: result }))
      return result
    },
    [cache, cached, regNo, setCache]
  )

  return [cached, setCached]
}

export function filterInvalid(cache?: DogCache): DogCache {
  const result: DogCache = {}
  if (!cache) {
    return result
  }
  for (const regNo of Object.keys(cache).filter(validateRegNo)) {
    result[regNo] = cache[regNo]
  }
  return result
}
