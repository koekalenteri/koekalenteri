import type { GridRowClassNameParams } from '@mui/x-data-grid'
import type { UpdateScope } from './atoms'
import { useAtomValue } from 'jotai'
import { useAtomCallback } from 'jotai/utils'
import { useCallback } from 'react'
import { recentlyUpdatedAtom, recentUpdateKey } from './atoms'

export const HIGHLIGHT_DURATION_MS = 2000
export const RECENTLY_UPDATED_ROW_CLASS_NAME = 'row-recently-updated'

const removeRecentlyUpdated = (current: Record<string, number>, key: string, updatedAt: number) => {
  if (current[key] !== updatedAt) return current

  const { [key]: _removed, ...rest } = current
  return rest
}

const scheduleRecentUpdateRemoval = (
  set: (atom: typeof recentlyUpdatedAtom, value: (current: Record<string, number>) => Record<string, number>) => void,
  key: string,
  updatedAt: number
) => {
  globalThis.setTimeout(() => {
    set(recentlyUpdatedAtom, (current) => removeRecentlyUpdated(current, key, updatedAt))
  }, HIGHLIGHT_DURATION_MS)
}

export const useMarkRecentlyUpdated = () =>
  useAtomCallback(
    useCallback((_get, set, scope: UpdateScope, id: string) => {
      const key = recentUpdateKey(scope, id)
      const updatedAt = Date.now()

      set(recentlyUpdatedAtom, (current) => ({ ...current, [key]: updatedAt }))
      scheduleRecentUpdateRemoval(set, key, updatedAt)
    }, [])
  )

export const useIsRecentlyUpdated = (scope: UpdateScope, id: string) => {
  const recentlyUpdated = useAtomValue(recentlyUpdatedAtom)

  return Boolean(recentlyUpdated[recentUpdateKey(scope, id)])
}

export const useRecentUpdateRowClassName = (scope: UpdateScope) => {
  const recentlyUpdated = useAtomValue(recentlyUpdatedAtom)

  return useCallback(
    (params: GridRowClassNameParams) =>
      typeof params.id === 'string' && recentlyUpdated[recentUpdateKey(scope, params.id)]
        ? RECENTLY_UPDATED_ROW_CLASS_NAME
        : '',
    [recentlyUpdated, scope]
  )
}
