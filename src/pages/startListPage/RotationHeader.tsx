import type { DayKey } from '../../types/Day'
import type { PublicConfirmedEvent } from '../../types/Event'
import TableCell from '@mui/material/TableCell'
import { useTranslation } from 'react-i18next'
import { scoresAtPosts } from '../../lib/results'
import { rotationStartLines } from '../../lib/rotation'
import { StyledTableRow } from './StyledTableRow'

interface RotationHeaderProps {
  event: PublicConfirmedEvent
  classValue: string
  date: DayKey
  /** A group of a number range is named by start numbers, so it waits for them to be published. */
  numbersPublished: boolean
}

/**
 * Under a class, where its groups start and in which order they go round the posts (KOE-1665). A
 * day the secretary laid out no rotation for has none, and the list reads as it always has. Nor has a
 * type not scored at posts: nothing reads a rotation there, so a stored one would only mislead.
 */
export const RotationHeader = ({ event, classValue, date, numbersPublished }: RotationHeaderProps) => {
  const { t } = useTranslation()
  if (!scoresAtPosts(event.eventType)) return null

  return rotationStartLines(event, classValue, date, numbersPublished, t).map((line) => (
    <StyledTableRow key={line}>
      <TableCell colSpan={6}>{line}</TableCell>
    </StyledTableRow>
  ))
}
