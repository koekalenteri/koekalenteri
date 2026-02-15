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
      hideable: false,
      sortComparator: (a, b) => (b as StartEndDate).start.valueOf() - (a as StartEndDate).start.valueOf(),
      valueFormatter: (value) => t('dateFormat.datespan', value as StartEndDate),
      valueGetter: (_value, row) => ({ end: row.endDate, start: row.startDate }),
      width: 120,
    },
    {
      field: 'eventType',
      flex: 1,
      headerName: t('event.eventType'),
      hideable: false,
      minWidth: 100,
    },
    {
      field: 'classes',
      flex: 1,
      headerName: t('event.classes'),
      minWidth: 100,
      valueGetter: (_value, row) =>
        ((row.classes || []) as Array<EventClass | string>)
          .map((c) => (typeof c === 'string' ? c : c.class))
          .join(', '),
    },
    {
      field: 'organizer',
      flex: 2,
      headerName: t('event.organizer'),
      minWidth: 100,
      sortComparator: localeSortComparator,
      valueGetter: (_value, row) => row.organizer.name,
    },
    {
      field: 'name',
      flex: 2,
      headerName: t('event.name'),
      minWidth: 100,
      sortComparator: localeSortComparator,
    },
    {
      field: 'location',
      flex: 1,
      headerName: t('event.location'),
      minWidth: 100,
      sortComparator: localeSortComparator,
    },
    {
      field: 'secretary',
      flex: 1,
      headerName: t('event.secretary'),
      minWidth: 100,
      sortComparator: localeSortComparator,
      valueGetter: (_value, row) => row.secretary?.name ?? '',
    },
    {
      field: 'official',
      flex: 1,
      headerName: t('event.official'),
      minWidth: 100,
      sortComparator: localeSortComparator,
      valueGetter: (_value, row) => row.official?.name,
    },
    {
      field: 'judges',
      flex: 1,
      headerName: t('judgeChief'),
      minWidth: 100,
      sortComparator: localeSortComparator,
      valueGetter: (_value, row) => row.judges?.[0]?.name,
    },
    {
      align: 'right',
      field: 'places',
      headerName: t('places'),
      valueGetter: (_value, row) => `${row.entries ?? '0'} / ${row.places ?? '0'}`,
      width: 80,
    },
    {
      field: 'state',
      flex: 1,
      headerName: t('event.state'),
      hideable: false,
      sortComparator: localeSortComparator,
      type: 'string',
      valueGetter: (_value, row) => getEventTitle(row, t),
    },
  ]
}
