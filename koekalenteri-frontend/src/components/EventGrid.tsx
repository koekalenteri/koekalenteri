import { Box } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useTranslation } from 'react-i18next';
import { EventClass, EventEx, EventState } from 'koekalenteri-shared/model';
import { useStores } from '../stores';
import { observer } from 'mobx-react-lite';

interface EventGridColDef extends GridColDef {
  field: keyof EventEx | 'date'
}

export const EventGrid = observer(({ events }: { events: EventEx[] }) => {
  const { t } = useTranslation();
  const { eventStore } = useStores();

  const columns: EventGridColDef[] = [
    {
      field: 'date',
      headerName: t('date'),
      width: 150,
      type: 'string',
      valueGetter: (params) => t('daterange', { start: params.row.startDate, end: params.row.endDate })
    },
    {
      field: 'eventType',
      headerName: t('eventType'),
      width: 150,
    },
    {
      field: 'classes',
      headerName: t('eventClasses'),
      width: 150,
      valueFormatter: ({value}) => ((value || []) as Array<EventClass|string>).map(c => typeof c === 'string' ? c : c.class).join(', ')
    },
    {
      field: 'location',
      headerName: t('location'),
      width: 150,
    },
    {
      field: 'name',
      headerName: t('name'),
      width: 150,
    },
    {
      field: 'state',
      headerName: t('state'),
      width: 150,
      type: 'string',
      valueFormatter: (params) => t((params.value || 'draft') as EventState, {ns: 'states'})
    },
  ];

  return (
    <Box sx={{
      height: '400px',
      width: '100%',
      '& .MuiDataGrid-columnHeaders': {
        backgroundColor: 'background.tableHead'
      },
      '& .MuiDataGrid-row:nth-of-type(2n+1)': {
        backgroundColor: 'background.oddRow'
      },
      '& .MuiDataGrid-cell:focus': {
        outlineColor: (theme) => theme.palette.secondary.dark
      }
    }}>
      <DataGrid
        autoPageSize
        columns={columns}
        density='compact'
        disableColumnMenu
        rows={events}
        onSelectionModelChange={(newSelectionModel) => {
          const id = newSelectionModel.length === 1 ? newSelectionModel[0] : '';
          eventStore.setSelectedEvent(events.find(e => e.id === id));
        }}
        selectionModel={eventStore.selectedEvent ? [eventStore.selectedEvent.id] : []}
      />
    </Box>
  );
})
