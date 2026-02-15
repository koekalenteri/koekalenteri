import type { Theme } from '@mui/material'
import type { DataGridProps } from '@mui/x-data-grid'
import { styled } from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import { useState } from 'react'

const DataGridWithDefaults = (props: DataGridProps) => {
  const [page, setPage] = useState(0)

  if (props.autoPageSize) {
    return <DataGrid initialState={{ density: 'compact' }} disableColumnMenu {...props} />
  }

  return (
    <DataGrid
      paginationModel={{ page, pageSize: 100 }}
      onPaginationModelChange={(model) => setPage(model.page)}
      pageSizeOptions={[100]}
      initialState={{ density: 'compact' }}
      disableColumnMenu
      {...props}
    />
  )
}

const StyledDataGrid = styled(DataGridWithDefaults)(({ theme }: { theme: Theme }) => {
  return {
    '& .MuiDataGrid-cell:focus': {
      outline: 'none',
    },
    '& .MuiDataGrid-row:hover': {
      backgroundColor: undefined,
    },
    '& .MuiDataGrid-row:hover > .MuiDataGrid-cell': {
      backgroundColor: theme.palette.background.hover,
    },
    '& .MuiDataGrid-row:nth-of-type(2n+1)': {
      backgroundColor: theme.palette.background.oddRow,
    },
    '& .MuiDataGrid-row.Mui-selected': {
      backgroundColor: theme.palette.background.selected,
    },
    '& .MuiDataGrid-row.Mui-selected:hover': {
      backgroundColor: theme.palette.background.hover,
    },
  }
})

export default StyledDataGrid
