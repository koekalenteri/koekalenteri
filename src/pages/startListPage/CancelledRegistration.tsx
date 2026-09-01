import TableCell from '@mui/material/TableCell'
import { useTranslation } from 'react-i18next'
import { StyledTableRow } from './StyledTableRow'

interface CancelledRegistrationProps {
  groupNumber?: number
}

export const CancelledRegistration = ({ groupNumber }: CancelledRegistrationProps) => {
  const { t } = useTranslation()

  return (
    <StyledTableRow key={groupNumber}>
      <TableCell align="right">{groupNumber}.</TableCell>
      <TableCell colSpan={5}>{t('startList.absent')}</TableCell>
    </StyledTableRow>
  )
}
