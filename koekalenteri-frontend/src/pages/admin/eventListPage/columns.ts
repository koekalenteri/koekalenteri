import { useTranslation } from 'react-i18next'
import { GridColDef, GridValueGetterParams } from '@mui/x-data-grid'
import { Event, EventClass, EventState } from 'koekalenteri-shared/model'

import { getEventTitle } from '../../../hooks/useEventTitle'
import { useJudgesActions } from '../../recoil'

interface EventListColDef extends GridColDef {
  field: keyof Event | 'date'
}

type StartEndDate = { start: Date; end: Date }

export default function useEventListColumns(): EventListColDef[] {
  const { t } = useTranslation()
  const judgeActions = useJudgesActions()

  return [
    {
      align: 'right',
      field: 'date',
      headerName: t('date'),
      width: 120,
      sortComparator: (a, b) => (b as StartEndDate).start.valueOf() - (a as StartEndDate).start.valueOf(),
      valueGetter: (params) => ({ start: params.row.startDate, end: params.row.endDate }),
      valueFormatter: ({ value }) => t('daterange', value as StartEndDate),
      hideable: false,
    },
    {
      field: 'eventType',
      headerName: t('event.eventType'),
      minWidth: 100,
      hideable: false,
    },
    {
      field: 'classes',
      headerName: t('event.classes'),
      minWidth: 100,
      flex: 1,
      valueGetter: (params) =>
        ((params.row.classes || []) as Array<EventClass | string>)
          .map((c) => (typeof c === 'string' ? c : c.class))
          .join(', '),
    },
    {
      field: 'name',
      headerName: t('event.name'),
      minWidth: 100,
      flex: 1,
    },
    {
      field: 'location',
      headerName: t('event.location'),
      minWidth: 100,
      flex: 1,
    },
    {
      field: 'secretary',
      headerName: t('event.secretary'),
      minWidth: 100,
      flex: 1,
      valueGetter: (params) => params.row.secretary?.name,
    },
    {
      field: 'official',
      headerName: t('event.official'),
      minWidth: 100,
      flex: 1,
      valueGetter: (params) => params.row.official?.name,
    },
    {
      field: 'judges',
      headerName: t('judgeChief'),
      minWidth: 100,
      flex: 1,
      valueGetter: (params) => params.row.judges && judgeActions.find(params.row.judges[0])?.name,
    },
    {
      field: 'places',
      headerName: t('places'),
      align: 'right',
      width: 80,
      valueGetter: (params) => `${params.row.entries ?? '0'} / ${params.row.places ?? '0'}`,
    },
    {
      field: 'state',
      headerName: t('event.state'),
      flex: 1,
      type: 'string',
      valueGetter: (params: GridValueGetterParams<EventState, Event>) => getEventTitle(params.row, t),
      hideable: false,
    },
  ]
}
