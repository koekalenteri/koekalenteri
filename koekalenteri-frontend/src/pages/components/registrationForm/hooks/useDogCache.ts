import { useCallback, useMemo } from 'react'
import { DeepPartial } from 'koekalenteri-shared/model'
import { useRecoilState } from 'recoil'

import { isEmpty, merge } from '../../../../utils'
import { DogCache, dogCacheAtom, DogCachedInfo } from '../../../recoil/dog'

type Setter = (props: DeepPartial<DogCachedInfo>) => DeepPartial<DogCachedInfo> | undefined
type HookResult = [DeepPartial<DogCachedInfo> | undefined, Setter]

export function useDogCache(regNo: string = ''): HookResult {
  const [cache, setCache] = useRecoilState(dogCacheAtom)
  const cached = useMemo(() => regNo ? cache?.[regNo] : undefined, [cache, regNo])
  const setCached = useCallback<Setter>((props) => {
    if (!regNo || isEmpty(props)) {
      return
    }
    const result = cached ? merge(cached, props) : props
    setCache(merge<DogCache>(cache, { [regNo]: result }))
    return result
  }, [cache, cached, regNo, setCache])

  return [cached, setCached]
}

