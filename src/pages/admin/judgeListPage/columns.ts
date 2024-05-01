import type { GridColDef } from '@mui/x-data-grid'
import type { Judge } from '../../../types'

import { useTranslation } from 'react-i18next'

import ActiveCell from './cells/ActiveCell'
import LanguagesCell from './cells/LanguagesCell'
import OfficialCell from './cells/OfficialCell'

export default function useJudgeListColumns(): GridColDef<Judge>[] {
  const { t } = useTranslation()

  return [
    {
      field: 'active',
      headerName: t('judgeActive'),
      renderCell: ActiveCell,
      width: 90,
    },
    {
      align: 'center',
      field: 'official',
      headerName: t('official'),
      renderCell: OfficialCell,
      width: 80,
    },
    {
      field: 'name',
      flex: 1,
      headerName: t('name'),
      minWidth: 150,
    },
    {
      field: 'id',
      flex: 0,
      headerName: t('id'),
      width: 80,
    },
    {
      field: 'location',
      flex: 1,
      headerName: t('contact.city'),
    },
    {
      field: 'phone',
      flex: 1,
      headerName: t('contact.phone'),
    },
    {
      field: 'email',
      flex: 2,
      headerName: t('contact.email'),
    },
    {
      field: 'district',
      flex: 1,
      headerName: 'Kennelpiiri',
    },
    {
      field: 'eventTypes',
      flex: 2,
      headerName: t('eventTypes'),
      valueGetter: (value: Judge['eventTypes']) => value?.join(', '),
    },
    {
      field: 'languages',
      flex: 0,
      headerName: t('languages'),
      renderCell: LanguagesCell,
      width: 220,
    },
  ]
}
