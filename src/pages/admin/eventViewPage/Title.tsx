import type { ConfirmedEvent } from '../../../types'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { eventTypeLabel } from '../../../lib/event'
import EventStateStepper from './EventStateStepper'

export default function Title({ event }: { readonly event: ConfirmedEvent }) {
  const { t } = useTranslation()
  const type = eventTypeLabel(event)

  return (
    <>
      <Typography variant="h5">
        {type}, {t('dateFormat.datespan', { end: event.endDate, start: event.startDate })}, {event.location}
        {event.name ? ` (${event.name})` : ''}
      </Typography>
      <EventStateStepper event={event} />
    </>
  )
}
