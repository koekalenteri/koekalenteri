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

type addPrefix<TKey, TPrefix extends string> = TKey extends string
  ? `${TPrefix}${TKey}`
  : never;

type EventStateNS = addPrefix<EventState, 'states:'>;

export const EventGrid = observer(({ events }: { events: EventEx[] }) => {
  const { t } = useTranslation(['common', 'event', 'states']);
  const { privateStore } = useStores();
  const naviage = useNavigate();

  const columns: EventGridColDef[] = [
    {
      field: 'date',
      headerName: t('common:date'),
      width: 150,
      type: 'string',
      valueGetter: (params) => t('common:daterange', { start: params.row.startDate, end: params.row.endDate })
    },
    {
      field: 'eventType',
      headerName: t('event:eventType'),
      width: 150,
    },
    {
      field: 'classes',
      headerName: t('event:classes'),
      width: 150,
      valueFormatter: ({value}) => ((value || []) as Array<EventClass|string>).map(c => typeof c === 'string' ? c : c.class).join(', ')
    },
    {
      field: 'location',
      headerName: t('event:location'),
      width: 150,
    },
    {
      field: 'name',
      headerName: t('event:name'),
      width: 150,
    },
    {
      field: 'state',
      headerName: t('event:state'),
      width: 150,
      type: 'string',
      valueFormatter: (params) => t(('states:' + (params.value || 'draft')) as EventStateNS)
    },
  ];

  return (
    <Box sx={{
      height: '400px',
      width: '100%',
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
        selectionModel={privateStore.selectedEvent ? [privateStore.selectedEvent.id] : []}
        onRowDoubleClick={(params) => naviage(ADMIN_EDIT_EVENT)}
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
            backgroundColor: 'secondary.light'
          },
          '& .MuiDataGrid-row:hover': {
            backgroundColor: undefined
          },
          '& .MuiDataGrid-row.Mui-selected:hover': {
            backgroundColor: 'secondary.light'
          },
          '& .MuiDataGrid-row:hover > .MuiDataGrid-cell': {
            background: 'linear-gradient(rgb(0 0 0 / 5%),rgb(0 0 0 / 10%))'
          }
        }}
      />
    </Box>
  );
})
