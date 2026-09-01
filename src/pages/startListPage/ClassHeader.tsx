import type { PublicConfirmedEvent } from '../../types/Event'
import TableCell from '@mui/material/TableCell'
import { useTranslation } from 'react-i18next'
import { zonedDateString } from '../../i18n/dates'
import { judgeName } from '../../lib/judge'
import { StyledTableRow } from './StyledTableRow'

interface ClassHeaderProps {
  classValue: string
  event: PublicConfirmedEvent
  lastDate?: Date
  published?: boolean
  /** False while the class's start numbers are unpublished: the rows below run alphabetically. */
  numbersPublished?: boolean
}

export const ClassHeader = ({
  classValue,
  event,
  lastDate,
  published = true,
  numbersPublished = true,
}: ClassHeaderProps) => {
  const { t } = useTranslation()
  const note = published ? '' : ` (${t('startListNotPublished')})`
  const numbersNote = published && !numbersPublished ? ` (${t('startNumbersNotPublished')})` : ''

  return (
    <StyledTableRow key={classValue}>
      <TableCell colSpan={6} sx={{ fontWeight: 'bold' }}>
        {classValue}{' '}
        {event.classes
          .filter(
            (c) =>
              c.class === classValue && !!c.date && !!lastDate && zonedDateString(c.date) === zonedDateString(lastDate)
          )
          .map((c) => (Array.isArray(c.judge) ? c.judge.map((j) => judgeName(j, t)).join(', ') : judgeName(c.judge, t)))
          .filter(Boolean)
          .join(', ')}
        {note}
        {numbersNote}
      </TableCell>
    </StyledTableRow>
  )
}
