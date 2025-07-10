import { styled } from '@mui/material/styles'
import TableRow from '@mui/material/TableRow'

export const StyledTableRow = styled(TableRow)(() => ({
  '& td, & th': {
    border: 0,
  },
  '&.top-border': {
    '& td:not(:first-of-type), & th:not(:first-of-type)': {
      borderTop: '1px dotted #aaa',
    },
  },
}))
