import type { GridColDef } from '@mui/x-data-grid'
import type { TFunction } from 'i18next'
import type { Official } from '../../types'
import { localeSortComparator } from '../../lib/datagrid'

type DirectoryField = 'district' | 'email' | 'eventTypes' | 'id' | 'location' | 'name' | 'phone'
type ColumnOverrides<T extends Official> = Partial<Record<DirectoryField, Partial<GridColDef<T>>>>

export const createOfficialDirectoryColumns = <T extends Official>(
  t: TFunction,
  overrides: ColumnOverrides<T> = {}
): GridColDef<T>[] => {
  const column = (field: DirectoryField, base: GridColDef<T>): GridColDef<T> => ({
    ...base,
    ...overrides[field],
  })

  return [
    column('name', {
      field: 'name',
      flex: 1,
      headerName: t('name'),
      minWidth: 150,
      sortComparator: localeSortComparator,
    }),
    column('id', { field: 'id', flex: 0, headerName: t('id'), width: 80 }),
    column('location', {
      field: 'location',
      flex: 0,
      headerName: t('contact.city'),
      sortComparator: localeSortComparator,
      width: 120,
    }),
    column('phone', { field: 'phone', flex: 0, headerName: t('contact.phone'), width: 150 }),
    column('email', { field: 'email', flex: 1, headerName: t('contact.email'), minWidth: 150 }),
    column('district', {
      field: 'district',
      flex: 1,
      headerName: t('district'),
      sortComparator: localeSortComparator,
    }),
    column('eventTypes', {
      field: 'eventTypes',
      flex: 1,
      headerName: t('eventTypes'),
      valueGetter: (value: T['eventTypes']) => value?.join(', '),
    }),
  ]
}
