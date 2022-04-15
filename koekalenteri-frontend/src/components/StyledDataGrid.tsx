import { styled, Theme } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";

export const StyledDataGrid = styled(DataGrid)(
  ({ theme }: { theme: Theme }) => {
    return {
      '& .MuiDataGrid-columnHeaders': {
        backgroundColor: theme.palette.background.tableHead
      },
      '& .MuiDataGrid-row:nth-of-type(2n+1)': {
        backgroundColor: theme.palette.background.oddRow
      },
      '& .MuiDataGrid-cell:focus': {
        outline: 'none'
      },
      '& .MuiDataGrid-row.Mui-selected': {
        backgroundColor: theme.palette.background.selected
      },
      '& .MuiDataGrid-row:hover': {
        backgroundColor: undefined
      },
      '& .MuiDataGrid-row.Mui-selected:hover': {
        backgroundColor: theme.palette.background.hover
      },
      '& .MuiDataGrid-row:hover > .MuiDataGrid-cell': {
        backgroundColor: theme.palette.background.hover
      }
    }
  }
);
