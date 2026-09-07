import type { ConfirmedEvent } from '../../../types'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { eventTypeLabel } from '../../../lib/event'
import { Path } from '../../../routeConfig'
import { BackLink } from '../components/BackLink'
import EventStateStepper from './EventStateStepper'

export default function Title({ event }: { readonly event: ConfirmedEvent }) {
  const { t } = useTranslation()
  const type = eventTypeLabel(event)

  return (
    <>
      {/* The way out of a trial the secretary opened from the list (KOE-541); the browser's own back
          button is the only one there was, and it is not where a way back is looked for. */}
      <BackLink to={Path.admin.events}>{t('backToEventsList')}</BackLink>
      <Typography variant="h5">
        {type}, {t('dateFormat.datespan', { end: event.endDate, start: event.startDate })}, {event.location}
        {event.name ? ` (${event.name})` : ''}
      </Typography>
      <EventStateStepper event={event} />
    </>
  )
}
