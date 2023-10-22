import type { Event } from '../../../types'

import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

import useEventTitle from '../../../hooks/useEventTitle'

export default function Title({ event }: { readonly event: Event }) {
  const { t } = useTranslation()
  const title = useEventTitle(event)

  return (
    <Typography variant="h5">
      {event.eventType}, {t('daterange', { start: event.startDate, end: event.endDate })}, {event.location}
      <Box sx={{ display: 'inline-block', mx: 2, color: '#018786' }}>{title}</Box>
    </Typography>
  )
}
