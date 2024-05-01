import type { GridColDef } from '@mui/x-data-grid'
import type { EventType, Language } from '../../../types'

import { useTranslation } from 'react-i18next'

import ActiveCell from './cells/ActiveCell'
import OfficialCell from './cells/OfficialCell'

export function useEventTypeListPageColumns(): GridColDef<EventType>[] {
  const { t, i18n } = useTranslation()

  return [
    {
      field: 'eventType',
      headerName: t('eventType.eventType'),
      width: 180,
    },
    {
      align: 'center',
      field: 'official',
      headerName: t('official'),
      renderCell: OfficialCell,
      width: 80,
    },
    {
      field: 'active',
      headerName: t('active'),
      renderCell: ActiveCell,
      width: 80,
    },
    {
      field: 'description',
      headerName: t('eventType.description'),
      flex: 1,
      valueGetter: (value: EventType['description']) => value[i18n.language as Language],
    },
  ]
}
