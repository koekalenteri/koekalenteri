import type { GridColDef } from '@mui/x-data-grid'
import type { DogEvent, EventClass } from '../../../types'

import { useTranslation } from 'react-i18next'

import { getEventTitle } from '../../../hooks/useEventTitle'
import { localeSortComparator } from '../../../lib/datagrid'

type StartEndDate = { start: Date; end: Date }

type EventWithDate = DogEvent & {
  date: StartEndDate
}

export default function useEventListColumns(): GridColDef<EventWithDate>[] {
  const { t } = useTranslation()

  return [
    {
      align: 'right',
      field: 'date',
      headerName: t('date'),
      width: 120,
      sortComparator: (a, b) => (b as StartEndDate).start.valueOf() - (a as StartEndDate).start.valueOf(),
      valueGetter: (_value, row) => ({ start: row.startDate, end: row.endDate }),
      valueFormatter: (value) => t('dateFormat.datespan', value as StartEndDate),
      hideable: false,
    },
    {
      field: 'eventType',
      headerName: t('event.eventType'),
      minWidth: 100,
      flex: 1,
      hideable: false,
    },
    {
      field: 'classes',
      headerName: t('event.classes'),
      minWidth: 100,
      flex: 1,
      valueGetter: (_value, row) =>
        ((row.classes || []) as Array<EventClass | string>)
          .map((c) => (typeof c === 'string' ? c : c.class))
          .join(', '),
    },
    {
      field: 'organizer',
      headerName: t('event.organizer'),
      minWidth: 100,
      valueGetter: (_value, row) => row.organizer.name,
      flex: 2,
      sortComparator: localeSortComparator,
    },
    {
      field: 'name',
      headerName: t('event.name'),
      minWidth: 100,
      flex: 2,
      sortComparator: localeSortComparator,
    },
    {
      field: 'location',
      headerName: t('event.location'),
      minWidth: 100,
      flex: 1,
      sortComparator: localeSortComparator,
    },
    {
      field: 'secretary',
      headerName: t('event.secretary'),
      minWidth: 100,
      flex: 1,
      valueGetter: (_value, row) => row.secretary?.name ?? '',
      sortComparator: localeSortComparator,
    },
    {
      field: 'official',
      headerName: t('event.official'),
      minWidth: 100,
      flex: 1,
      valueGetter: (_value, row) => row.official?.name,
      sortComparator: localeSortComparator,
    },
    {
      field: 'judges',
      headerName: t('judgeChief'),
      minWidth: 100,
      flex: 1,
      valueGetter: (_value, row) => row.judges?.[0]?.name,
      sortComparator: localeSortComparator,
    },
    {
      field: 'places',
      headerName: t('places'),
      align: 'right',
      width: 80,
      valueGetter: (_value, row) => `${row.entries ?? '0'} / ${row.places ?? '0'}`,
    },
    {
      field: 'state',
      headerName: t('event.state'),
      flex: 1,
      type: 'string',
      valueGetter: (_value, row) => getEventTitle(row, t),
      hideable: false,
      sortComparator: localeSortComparator,
    },
  ]
}
