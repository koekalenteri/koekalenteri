import { styled, Theme } from '@mui/material'
import { DataGrid, DataGridProps } from '@mui/x-data-grid'

const DataGridWithDefaults = (props: DataGridProps) => {
  return <DataGrid pageSize={100} rowsPerPageOptions={[100]} density="compact" disableColumnMenu {...props} />
}

const StyledDataGrid = styled(DataGridWithDefaults)(({ theme }: { theme: Theme }) => {
  return {
    '& .MuiDataGrid-columnHeaders': {
      backgroundColor: theme.palette.background.tableHead,
    },
    '& .MuiDataGrid-row:nth-of-type(2n+1)': {
      backgroundColor: theme.palette.background.oddRow,
    },
    '& .MuiDataGrid-cell:focus': {
      outline: 'none',
    },
    '& .MuiDataGrid-row.Mui-selected': {
      backgroundColor: theme.palette.background.selected,
    },
    '& .MuiDataGrid-row:hover': {
      backgroundColor: undefined,
    },
    '& .MuiDataGrid-row.Mui-selected:hover': {
      backgroundColor: theme.palette.background.hover,
    },
    '& .MuiDataGrid-row:hover > .MuiDataGrid-cell': {
      backgroundColor: theme.palette.background.hover,
    },
  }
})

export default StyledDataGrid
