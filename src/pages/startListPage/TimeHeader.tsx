import type { RegistrationTime } from '../../types/Registration'

import { useTranslation } from 'react-i18next'
import TableCell from '@mui/material/TableCell'

import { StyledTableRow } from './StyledTableRow'

interface TimeHeaderProps {
  time: RegistrationTime
  lastDate?: Date
}

export const TimeHeader = ({ time, lastDate }: TimeHeaderProps) => {
  const { t } = useTranslation()

  return (
    <StyledTableRow key={`${lastDate?.toISOString()} ${time}`}>
      <TableCell colSpan={6} sx={{ fontWeight: 'bold' }}>
        {t(`registration.timeLong.${time}`)}
      </TableCell>
    </StyledTableRow>
  )
}
