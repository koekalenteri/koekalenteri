import type { ReactNode } from 'react'
import ArrowBack from '@mui/icons-material/ArrowBack'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Path } from '../../../routeConfig'

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
      <Button
        component={Link}
        size="small"
        startIcon={<ArrowBack fontSize="small" />}
        sx={{ ml: -1 }}
        to={Path.admin.viewEvent(eventId)}
      >
        {t('results.backToEvent')}
      </Button>
      <Typography variant="h6">{title}</Typography>
      {children}
    </Box>
  )
}
