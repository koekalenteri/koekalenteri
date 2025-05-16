import type { PublicConfirmedEvent } from '../../types/Event'

import { useTranslation } from 'react-i18next'
import Grid2 from '@mui/material/Grid2'

interface EventHeaderProps {
  event: PublicConfirmedEvent
  now: Date
}

export const EventHeader = ({ event, now }: EventHeaderProps) => {
  const { t } = useTranslation()

  return (
    <Grid2 container>
      <Grid2 display="flex" flexGrow={1}>
        <h1>
          {event.eventType} {event.location} {event.name ? `(${event.name})` : ''}
        </h1>
      </Grid2>
      <Grid2 display="flex" justifyContent="end">
        {t('dateFormat.dtshort', { date: now })}
      </Grid2>
    </Grid2>
  )
}
