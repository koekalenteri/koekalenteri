import { Box } from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { EventEx } from 'koekalenteri-shared/model';

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 90 },
  {
    field: 'location',
    headerName: 'Location',
    width: 150,
  },
];

export function EventGrid({ events }: { events: EventEx[] }) {
  return (
    <Box sx={{
      height: '400px',
      width: '100%',
      '& .MuiDataGrid-columnHeaders': {
        backgroundColor: 'background.tableHead'
      },
      '& .MuiDataGrid-row:nth-of-type(2n+1)': {
        backgroundColor: 'background.oddRow'
      }
    }}>
      <DataGrid
        autoPageSize
        density='compact'
        rows={events}
        columns={columns}
      />
    </Box>
  );
}
