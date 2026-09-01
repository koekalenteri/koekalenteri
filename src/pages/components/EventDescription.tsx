import type { GridProps } from '@mui/material'
import Box from '@mui/material/Box'
import { useTranslation } from 'react-i18next'
import { ItemWithCaption } from './ItemWithCaption'

interface Props {
  readonly description?: string
}

/**
 * KOE-740: the secretary writes the additional info in paragraphs, and the stored text keeps the
 * newlines -- only the rendering collapsed them into one block. `pre-line` prints the paragraphs
 * as written while still wrapping long lines to the column.
 */
export const EventDescription = ({ description, ...gridProps }: Props & GridProps) => {
  const { t } = useTranslation()

  if (!description) return null

  return (
    <ItemWithCaption label={t('event.description')} {...gridProps}>
      <Box sx={{ overflowWrap: 'break-word', whiteSpace: 'pre-line' }}>{description}</Box>
    </ItemWithCaption>
  )
}
