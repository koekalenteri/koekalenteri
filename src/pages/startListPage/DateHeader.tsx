import type { DayKey } from '../../types/Day'
import TableCell from '@mui/material/TableCell'
import { useTranslation } from 'react-i18next'
import { StyledTableRow } from './StyledTableRow'

interface DateHeaderProps {
  date: DayKey
}

export const DateHeader = ({ date }: DateHeaderProps) => {
  const { t } = useTranslation()

  return (
    <StyledTableRow key={date}>
      <TableCell colSpan={6}>
        <h2>
          {t('dateFormat.weekday', { date })} {t('dateFormat.date', { date })}
        </h2>
      </TableCell>
    </StyledTableRow>
  )
}
