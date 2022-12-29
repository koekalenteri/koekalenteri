import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Typography } from '@mui/material'

import { DecoratedEvent } from '../recoil'

function Title({ event }: { event: DecoratedEvent }) {
  const { t } = useTranslation()
  const title = useMemo(() => {
    if (event.isEventOver) {
      return t('event.states.confirmed_eventOver')
    }
    return event.isEntryClosed
      ? t('event.states.confirmed_entryClosed')
      : t('event.states.confirmed_entryOpen')
  }, [event, t])

  return (
    <Typography variant="h5">
      {event.eventType}, {t('daterange', { start: event.startDate, end: event.endDate })}, {event.location}
      <Box sx={{ display: 'inline-block', mx: 2, color: '#018786' }}>{title}</Box>
    </Typography>
  )
}

export default Title
