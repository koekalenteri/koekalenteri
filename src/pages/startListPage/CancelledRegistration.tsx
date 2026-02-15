import TableCell from '@mui/material/TableCell'
import { StyledTableRow } from './StyledTableRow'

interface CancelledRegistrationProps {
  groupNumber: number
}

export const CancelledRegistration = ({ groupNumber }: CancelledRegistrationProps) => {
  return (
    <StyledTableRow key={groupNumber}>
      <TableCell align="right">{groupNumber}.</TableCell>
      <TableCell colSpan={5}>PERUTTU</TableCell>
    </StyledTableRow>
  )
}
