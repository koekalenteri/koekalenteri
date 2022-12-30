import { useTranslation } from 'react-i18next'
import { GridColDef } from '@mui/x-data-grid'
import { Judge } from 'koekalenteri-shared/model'

import ActiveCell from "./cells/ActiveCell"
import LanguagesCell from './cells/LanguagesCell'
import OfficialCell from "./cells/OfficialCell"

interface JudgeColDef extends GridColDef {
  field: keyof Judge
}

export default function useJudgeListColumns(): JudgeColDef[] {
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
      headerName: t('registration.contact.city'),
    },
    {
      field: 'phone',
      flex: 1,
      headerName: t('registration.contact.phone'),
    },
    {
      field: 'email',
      flex: 2,
      headerName: t('registration.contact.email'),
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
      valueGetter: (params) => params.row.eventTypes?.join(', '),
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
