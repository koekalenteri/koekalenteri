import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { EventEx } from 'koekalenteri-shared/model';

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 90 },
  {
    field: 'location',
    headerName: 'Location',
    width: 150,
    editable: true,
  },
];

export function EventGrid({events}: {events: EventEx[]}) {
  return (
    <div style={{ height: 1200, width: '100%' }}>
      <DataGrid
        rows={events}
        columns={columns}
        pageSize={5}
        rowsPerPageOptions={[5]}
        checkboxSelection
        disableSelectionOnClick
      />
    </div>
  );
}
