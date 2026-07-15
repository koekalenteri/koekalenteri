import type { ConfirmedEvent } from '../../../types'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import EventStateStepper from './EventStateStepper'

export default function Title({ event }: { readonly event: ConfirmedEvent }) {
  const { t } = useTranslation()

  return (
    <>
      <Typography variant="h5">
        {event.eventType}, {t('dateFormat.datespan', { end: event.endDate, start: event.startDate })}, {event.location}
        {event.name ? ` (${event.name})` : ''}
      </Typography>
      <EventStateStepper event={event} />
    </>
  )
}
