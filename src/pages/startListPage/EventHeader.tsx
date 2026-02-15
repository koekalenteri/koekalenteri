import type { PublicConfirmedEvent } from '../../types/Event'
import Grid from '@mui/material/Grid'
import { useTranslation } from 'react-i18next'

interface EventHeaderProps {
  event: PublicConfirmedEvent
  now: Date
}

export const EventHeader = ({ event, now }: EventHeaderProps) => {
  const { t } = useTranslation()

  return (
    <Grid container>
      <Grid display="flex" flexGrow={1}>
        <h1>
          {event.eventType} {event.location} {event.name ? `(${event.name})` : ''}
        </h1>
      </Grid>
      <Grid display="flex" justifyContent="end">
        {t('dateFormat.dtshort', { date: now })}
      </Grid>
    </Grid>
  )
}
