import { Box } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useTranslation } from 'react-i18next';
import { EventClass, EventEx, EventState } from 'koekalenteri-shared/model';
import { useStores } from '../stores';
import { observer } from 'mobx-react-lite';
import { ADMIN_EDIT_EVENT } from '../config';
import { useNavigate } from 'react-router-dom';

interface EventGridColDef extends GridColDef {
  field: keyof EventEx | 'date'
}

type StartEndDate = { start: Date, end: Date };

export const EventGrid = observer(({ events }: { events: Partial<EventEx>[] }) => {
  const { t } = useTranslation();
  const { rootStore, privateStore } = useStores();
  const naviage = useNavigate();

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
      valueGetter: (params) => rootStore.judgeStore.getJudge(params.row.judges[0])?.name
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
      valueGetter: (params) => (params.row as EventEx).isEntryOpen ? t('event.states.confirmed_entryOpen') : t(`event.states.${(params.value || 'draft') as EventState}`)
    },
  ];

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 1,
      width: '100%',
      minHeight: 300,
    }}>
      <DataGrid
        autoPageSize
        columns={columns}
        density='compact'
        disableColumnMenu
        rows={events}
        onSelectionModelChange={(newSelectionModel) => {
          const id = newSelectionModel.length === 1 ? newSelectionModel[0] : '';
          privateStore.setSelectedEvent(events.find(e => e.id === id));
        }}
        selectionModel={privateStore.selectedEvent && privateStore.selectedEvent.id ? [privateStore.selectedEvent.id] : []}
        onRowDoubleClick={() => naviage(`${ADMIN_EDIT_EVENT}/${privateStore.selectedEvent?.id}`)}
        sx={{
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: 'background.tableHead'
          },
          '& .MuiDataGrid-row:nth-of-type(2n+1)': {
            backgroundColor: 'background.oddRow'
          },
          '& .MuiDataGrid-cell:focus': {
            outline: 'none'
          },
          '& .MuiDataGrid-row.Mui-selected': {
            backgroundColor: 'background.selected'
          },
          '& .MuiDataGrid-row:hover': {
            backgroundColor: undefined
          },
          '& .MuiDataGrid-row.Mui-selected:hover': {
            backgroundColor: 'background.hover'
          },
          '& .MuiDataGrid-row:hover > .MuiDataGrid-cell': {
            backgroundColor: 'background.hover'
          }
        }}
      />
    </Box>
  );
})
