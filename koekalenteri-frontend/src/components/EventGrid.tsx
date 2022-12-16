import { Box } from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';
import { Event, EventClass, EventEx, EventState } from 'koekalenteri-shared/model';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ADMIN_EDIT_EVENT, ADMIN_VIEW_EVENT } from '../routeConfig';
import { useStores } from '../stores';
import { StyledDataGrid } from './StyledDataGrid';

interface EventGridColDef extends GridColDef {
  field: keyof EventEx | 'date'
}

type StartEndDate = { start: Date, end: Date };

export const EventGrid = observer(function EventGrid({ events }: { events: Partial<EventEx>[] }) {
  const { t } = useTranslation();
  const { rootStore, privateStore } = useStores();
  const navigate = useNavigate();

  const columns: EventGridColDef[] = [
    {
      align: 'right',
      field: 'date',
      headerName: t('date'),
      width: 120,
      sortComparator: (a, b) => (b as StartEndDate).start.valueOf() - (a as StartEndDate).start.valueOf(),
      valueGetter: (params) => ({ start: params.row.startDate, end: params.row.endDate }),
      valueFormatter: ({value}) => t('daterange', value as StartEndDate),
    },
    {
      field: 'eventType',
      headerName: t('event.eventType'),
      minWidth: 100,
    },
    {
      field: 'classes',
      headerName: t('event.classes'),
      minWidth: 100,
      flex: 1,
      valueGetter: (params) => ((params.row.classes || []) as Array<EventClass|string>).map(c => typeof c === 'string' ? c : c.class).join(', ')
    },
    {
      field: 'location',
      headerName: t('event.location'),
      minWidth: 100,
      flex: 1,
    },
    {
      field: 'official',
      headerName: t('event.official'),
      minWidth: 100,
      flex: 1,
      valueGetter: (params) => params.row.official?.name
    },
    {
      field: 'judges',
      headerName: t('judgeChief'),
      minWidth: 100,
      flex: 1,
      valueGetter: (params) => params.row.judges && rootStore.judgeStore.getJudge(params.row.judges[0])?.toJSON().name
    },
    {
      field: 'places',
      headerName: t('places'),
      align: 'right',
      width: 80,
      valueGetter: (params) => `${params.row.entries} / ${params.row.places}`
    },
    {
      field: 'state',
      headerName: t('event.state'),
      flex: 1,
      type: 'string',
      valueGetter: (params) => {
        const event: EventEx = params.row;
        if (event.isEntryOpen) {
          return t('event.states.confirmed_entryOpen')
        }
        if (event.isEntryClosed) {
          return t('event.states.confirmed_entryClosed')
        }
        if (event.isEventOngoing) {
          return t('event.states.confirmed_eventOngoing')
        }
        if (event.isEventOver) {
          return t('event.states.confirmed_eventOver')
        }
        return t(`event.states.${(params.value || 'draft') as EventState}`)
      }
    },
  ];

  const handleDoubleClick = (event?: Partial<Event>) => {
    if (!event) return
    navigate(`${event.entries ? ADMIN_VIEW_EVENT : ADMIN_EDIT_EVENT}/${event.id}`)
  }

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 1,
      width: '100%',
      minHeight: 300,
    }}>
      <StyledDataGrid
        autoPageSize
        columns={columns}
        density='compact'
        disableColumnMenu
        rows={events}
        onSelectionModelChange={(selection) => privateStore.selectEvent(selection[0] as string || '')}
        selectionModel={privateStore.selectedEvent && privateStore.selectedEvent.id ? [privateStore.selectedEvent.id] : []}
        onRowDoubleClick={() => handleDoubleClick(privateStore.selectedEvent)}
      />
    </Box>
  );
})
