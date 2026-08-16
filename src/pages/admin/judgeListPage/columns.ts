import type { GridColDef } from '@mui/x-data-grid'
import type { Judge } from '../../../types'
import { useTranslation } from 'react-i18next'
import OfficialCell from '../components/OfficialCell'
import { createOfficialDirectoryColumns } from '../officialDirectoryColumns'
import ActiveCell from './cells/ActiveCell'
import LanguagesCell from './cells/LanguagesCell'

export default function useJudgeListColumns(): GridColDef<Judge>[] {
  const { t } = useTranslation()
  const directoryColumns = createOfficialDirectoryColumns<Judge>(t, {
    district: { headerName: 'Kennelpiiri' },
    email: { flex: 2, minWidth: undefined },
    eventTypes: { flex: 2 },
    location: { flex: 1, width: undefined },
    phone: { flex: 1, width: undefined },
  })

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
    ...directoryColumns,
    {
      field: 'languages',
      flex: 0,
      headerName: t('languages'),
      renderCell: LanguagesCell,
      width: 220,
    },
  ]
}
