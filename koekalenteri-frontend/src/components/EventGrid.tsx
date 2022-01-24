import { Box } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { EventEx } from 'koekalenteri-shared/model';
import { useStores } from '../stores';
import { observer } from 'mobx-react-lite';

interface EventGridColDef extends GridColDef {
  field: keyof EventEx
}

export const EventGrid = observer(({ events }: { events: EventEx[] }) => {
  const { t } = useTranslation();
  const { eventStore } = useStores();

  const columns: EventGridColDef[] = [
    { field: 'id', headerName: 'ID', width: 90 },
    {
      field: 'location',
      headerName: 'Location',
      width: 150,
    },
    {
      field: 'name',
      headerName: 'Name',
      width: 150,
    },
    {
      field: 'startDate',
      headerName: 'Start Date',
      width: 150,
      type: 'date',
      valueFormatter: (params) => params.value instanceof Date ? format(params.value, t('dateformat')) : ''
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
