import type { ReactNode } from 'react'
import type { EventSubtitleFields } from '@/lib/event'
import type { PublicDogEvent } from '@/types'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { eventSubtitle } from '@/lib/event'
import { Path } from '@/routeConfig'
import { languageAtom } from '../../state'
import { BackLink } from './BackLink'

interface Props {
  readonly event: EventSubtitleFields & Pick<PublicDogEvent, 'id'>
  readonly title: string
  /** Where the way back leads when it is not the event view the screen was reached from. */
  readonly back?: { readonly to: string; readonly label: string }
  readonly children?: ReactNode
}

/**
 * The head of a batch entry screen: the way back, the title, which trial this is, and whatever else
 * the screen says beneath them. The trial is not left to the screen, so a secretary never enters
 * against the wrong one unawares (KOE-1699).
 */
export function EntryPageHeader({ event, title, back, children }: Props) {
  const { t } = useTranslation()
  const language = useAtomValue(languageAtom)

  return (
    <Box sx={{ pt: 2, px: 2 }}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', columnGap: 1 }}>
        <BackLink
          headingVariant="h3"
          label={back?.label ?? t('results.backToEvent')}
          to={back?.to ?? Path.admin.viewEvent(event.id)}
        />
        <Typography variant="h3" component="h1">
          {title}
        </Typography>
      </Stack>
      <Typography variant="body2">{eventSubtitle(event, language, t)}</Typography>
      {children}
    </Box>
  )
}
