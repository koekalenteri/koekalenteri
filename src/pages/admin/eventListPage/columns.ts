import type { GridColDef } from '@mui/x-data-grid'
import type { Event, EventClass } from '../../../types'

import { useTranslation } from 'react-i18next'

import { getEventTitle } from '../../../hooks/useEventTitle'
import { useJudgesActions } from '../../recoil'

type StartEndDate = { start: Date; end: Date }

type EventWithDate = Event & {
  date: StartEndDate
}

export default function useEventListColumns(): GridColDef<EventWithDate>[] {
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
      field: 'organizer',
      headerName: t('event.organizer'),
      minWidth: 100,
      valueGetter: (params) => params.row.organizer.name,
      flex: 1,
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
      valueGetter: (params) => params.row.secretary?.name || '',
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
      valueGetter: (params) => getEventTitle(params.row, t),
      hideable: false,
    },
  ]
}
