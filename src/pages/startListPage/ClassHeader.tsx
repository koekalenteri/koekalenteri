import type { PublicConfirmedEvent } from '../../types/Event'
import TableCell from '@mui/material/TableCell'
import { useTranslation } from 'react-i18next'
import { judgeName } from '../../lib/judge'
import { StyledTableRow } from './StyledTableRow'

interface ClassHeaderProps {
  classValue: string
  event: PublicConfirmedEvent
  lastDate?: Date
}

export const ClassHeader = ({ classValue, event, lastDate }: ClassHeaderProps) => {
  const { t } = useTranslation()

  return (
    <StyledTableRow key={classValue}>
      <TableCell colSpan={6} sx={{ fontWeight: 'bold' }}>
        {classValue}{' '}
        {event.classes
          .filter((c) => c.class === classValue && c.date?.valueOf() === lastDate?.valueOf())
          .map((c) => (Array.isArray(c.judge) ? c.judge.map((j) => judgeName(j, t)).join(', ') : judgeName(c.judge, t)))
          .filter(Boolean)
          .join(', ')}
      </TableCell>
    </StyledTableRow>
  )
}
