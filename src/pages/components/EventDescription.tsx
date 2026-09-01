import type { GridProps } from '@mui/material'
import type { PublicDogEvent } from '../../types'
import Box from '@mui/material/Box'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { localizedEventDescription } from '../../lib/event'
import { languageAtom } from '../state'
import { ItemWithCaption } from './ItemWithCaption'

interface Props {
  readonly event: Pick<PublicDogEvent, 'description' | 'descriptions'>
}

/**
 * KOE-740: the secretary writes the additional info in paragraphs, and the stored text keeps the
 * newlines -- only the rendering collapsed them into one block. `pre-line` prints the paragraphs
 * as written while still wrapping long lines to the column.
 *
 * KOE-1263: the text is shown in the viewer's language when the secretary gave a translation.
 */
export const EventDescription = ({ event, ...gridProps }: Props & GridProps) => {
  const { t } = useTranslation()
  const language = useAtomValue(languageAtom)
  const description = localizedEventDescription(event, language)

  if (!description) return null

  return (
    <ItemWithCaption label={t('event.description')} {...gridProps}>
      <Box sx={{ overflowWrap: 'break-word', whiteSpace: 'pre-line' }}>{description}</Box>
    </ItemWithCaption>
  )
}
