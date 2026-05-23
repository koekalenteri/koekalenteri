import type { GridRowClassNameParams } from '@mui/x-data-grid'
import type { UpdateScope } from './atoms'
import { useCallback } from 'react'
import { useRecoilCallback, useRecoilValue } from 'recoil'
import { recentlyUpdatedAtom, recentUpdateKey } from './atoms'

export const HIGHLIGHT_DURATION_MS = 2000
export const RECENTLY_UPDATED_ROW_CLASS_NAME = 'row-recently-updated'

export const useMarkRecentlyUpdated = () =>
  useRecoilCallback(
    ({ set }) =>
      (scope: UpdateScope, id: string) => {
        const key = recentUpdateKey(scope, id)
        const updatedAt = Date.now()

        set(recentlyUpdatedAtom, (current) => ({ ...current, [key]: updatedAt }))

        globalThis.setTimeout(() => {
          set(recentlyUpdatedAtom, (current) => {
            if (current[key] !== updatedAt) return current

            const { [key]: _removed, ...rest } = current
            return rest
          })
        }, HIGHLIGHT_DURATION_MS)
      },
    []
  )

export const useIsRecentlyUpdated = (scope: UpdateScope, id: string) => {
  const recentlyUpdated = useRecoilValue(recentlyUpdatedAtom)

  return Boolean(recentlyUpdated[recentUpdateKey(scope, id)])
}

export const useRecentUpdateRowClassName = (scope: UpdateScope) => {
  const recentlyUpdated = useRecoilValue(recentlyUpdatedAtom)

  return useCallback(
    (params: GridRowClassNameParams) =>
      typeof params.id === 'string' && recentlyUpdated[recentUpdateKey(scope, params.id)]
        ? RECENTLY_UPDATED_ROW_CLASS_NAME
        : '',
    [recentlyUpdated, scope]
  )
}
