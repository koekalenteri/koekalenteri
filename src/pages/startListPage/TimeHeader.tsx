import type { DayKey } from '../../types/Day'
import type { RegistrationTime } from '../../types/Registration'
import TableCell from '@mui/material/TableCell'
import { useTranslation } from 'react-i18next'
import { StyledTableRow } from './StyledTableRow'

interface TimeHeaderProps {
  time: RegistrationTime
  lastDate?: DayKey
}

export const TimeHeader = ({ time, lastDate }: TimeHeaderProps) => {
  const { t } = useTranslation()

  return (
    <StyledTableRow key={`${lastDate} ${time}`}>
      <TableCell colSpan={6} sx={{ fontWeight: 'bold' }}>
        {t(`registration.timeLong.${time}`)}
      </TableCell>
    </StyledTableRow>
  )
}
