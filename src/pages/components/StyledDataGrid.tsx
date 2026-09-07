import type { Theme } from '@mui/material'
import type { DataGridProps } from '@mui/x-data-grid'
import { styled } from '@mui/material'
import { DataGrid } from '@mui/x-data-grid'
import { useState } from 'react'
import { recentUpdateFlash } from '../../assets/highlight'
import { RECENTLY_UPDATED_ROW_CLASS_NAME } from '../state/recentUpdates'

const DataGridWithDefaults = (props: DataGridProps) => {
  const [page, setPage] = useState(0)
  // Since x-data-grid v8 the toolbar slot is only rendered when showToolbar is set, so a grid that
  // gives one gets it shown; without this the search, the column selector and the page's own filters
  // are silently dropped.
  const showToolbar = Boolean(props.slots?.toolbar)

  if (props.autoPageSize) {
    return <DataGrid initialState={{ density: 'compact' }} disableColumnMenu showToolbar={showToolbar} {...props} />
  }

  return (
    <DataGrid
      paginationModel={{ page, pageSize: 100 }}
      onPaginationModelChange={(model) => setPage(model.page)}
      pageSizeOptions={[100]}
      initialState={{ density: 'compact' }}
      disableColumnMenu
      showToolbar={showToolbar}
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
    [`& .MuiDataGrid-row.${RECENTLY_UPDATED_ROW_CLASS_NAME} > .MuiDataGrid-cell`]: {
      animation: `${recentUpdateFlash} 2s ease-out`,
    },
    [`@media (prefers-reduced-motion: reduce)`]: {
      [`& .MuiDataGrid-row.${RECENTLY_UPDATED_ROW_CLASS_NAME} > .MuiDataGrid-cell`]: {
        animation: 'none',
        backgroundColor: theme.palette.background.ok,
      },
    },
  }
})

export default StyledDataGrid
