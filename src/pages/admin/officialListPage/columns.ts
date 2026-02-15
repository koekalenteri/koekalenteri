import type { GridColDef } from '@mui/x-data-grid'
import type { Official } from '../../../types'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { localeSortComparator } from '../../../lib/datagrid'

export const useOfficialListPageColumns = () => {
  const { t } = useTranslation()

  const columns: GridColDef<Official>[] = useMemo(
    () => [
      {
        field: 'name',
        flex: 1,
        headerName: t('name'),
        minWidth: 150,
        sortComparator: localeSortComparator,
      },
      {
        field: 'id',
        flex: 0,
        headerName: t('id'),
        width: 80,
      },
      {
        field: 'location',
        flex: 0,
        headerName: t('contact.city'),
        sortComparator: localeSortComparator,
        width: 120,
      },
      {
        field: 'phone',
        flex: 0,
        headerName: t('contact.phone'),
        width: 150,
      },
      {
        field: 'email',
        flex: 1,
        headerName: t('contact.email'),
        minWidth: 150,
      },
      {
        field: 'district',
        flex: 1,
        headerName: t('district'),
        sortComparator: localeSortComparator,
      },
      {
        field: 'eventTypes',
        flex: 1,
        headerName: t('eventTypes'),
        valueGetter: (value: Official['eventTypes']) => value?.join(', '),
      },
    ],
    [t]
  )

  return columns
}
