import { useCallback, useMemo } from 'react'
import { DeepPartial } from 'koekalenteri-shared/model'
import { useRecoilState } from 'recoil'
import { applyDiff, getDiff } from 'recursive-diff'

import { dogCacheAtom, DogCachedInfo } from '../../../recoil/dog'

type Setter = (props: DeepPartial<DogCachedInfo>) => DogCachedInfo | undefined
type HookResult = [Partial<DogCachedInfo> | undefined, Setter]

export function useDogCache(regNo: string = ''): HookResult {
  const [cache, setCache] = useRecoilState(dogCacheAtom)
  const cached = useMemo(() => cache?.[regNo], [cache, regNo])
  const setCached = useCallback<Setter>((props) => {
    if (!regNo) {
      return
    }
    const diff = getDiff({}, props)
    if (diff.length) {
      const newState = cached ? structuredClone(cached) : {}
      const result = applyDiff(newState, diff)
      const newCache = {...cache}
      newCache[regNo] = newState
      setCache(newCache)
      return result
    }
  }, [cache, cached, regNo, setCache])

  return [cached, setCached]
}

