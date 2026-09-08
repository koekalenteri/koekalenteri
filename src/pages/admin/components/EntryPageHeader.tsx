import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { Path } from '@/routeConfig'
import { BackLink } from './BackLink'

interface Props {
  readonly eventId: string
  readonly title: string
  readonly children?: ReactNode
}

/**
 * The head of a batch entry screen reached from the event view: the way back, the title, and
 * whatever the screen says about the event beneath it.
 */
export function EntryPageHeader({ eventId, title, children }: Props) {
  const { t } = useTranslation()

  return (
    <Box sx={{ pt: 2, px: 2 }}>
      <BackLink to={Path.admin.viewEvent(eventId)}>{t('results.backToEvent')}</BackLink>
      <Typography variant="h6">{title}</Typography>
      {children}
    </Box>
  )
}
