import type { DayKey } from '../../types/Day'
import type { PublicConfirmedEvent } from '../../types/Event'
import TableCell from '@mui/material/TableCell'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { classLabel } from '../../lib/event'
import { judgeName } from '../../lib/judge'
import { publicationNote } from '../../lib/startListView'
import { languageAtom } from '../state/user/atoms'
import { StyledTableRow } from './StyledTableRow'

interface ClassHeaderProps {
  classValue: string
  event: PublicConfirmedEvent
  lastDate?: DayKey
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
  const language = useAtomValue(languageAtom)
  const note = publicationNote(published, numbersPublished)

  return (
    <StyledTableRow key={classValue}>
      <TableCell colSpan={6} sx={{ fontWeight: 'bold' }}>
        {classValue && classLabel(event, classValue, language)}{' '}
        {event.classes
          .filter((c) => c.class === classValue && !!c.date && c.date === lastDate)
          .map((c) => (Array.isArray(c.judge) ? c.judge.map((j) => judgeName(j, t)).join(', ') : judgeName(c.judge, t)))
          .filter(Boolean)
          .join(', ')}
        {note && ` (${t(note)})`}
      </TableCell>
    </StyledTableRow>
  )
}
