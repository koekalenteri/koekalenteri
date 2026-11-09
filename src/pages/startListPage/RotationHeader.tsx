import type { DayKey } from '../../types/Day'
import type { PublicConfirmedEvent } from '../../types/Event'
import TableCell from '@mui/material/TableCell'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { formatTypeOf } from '../../lib/event'
import { scoresAtPosts } from '../../lib/liveFormat'
import { rotationStartLines } from '../../lib/rotation'
import { languageAtom } from '../state/user/atoms'
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
  const language = useAtomValue(languageAtom)
  if (!scoresAtPosts(formatTypeOf(event))) return null

  return rotationStartLines(event, classValue, date, numbersPublished, t, language).map((line) => (
    <StyledTableRow key={line}>
      <TableCell colSpan={6}>{line}</TableCell>
    </StyledTableRow>
  ))
}
