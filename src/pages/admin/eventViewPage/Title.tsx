import type { ConfirmedEvent } from '@/types'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { eventTypeLabel, localizedEventName } from '@/lib/event'
import { Path } from '@/routeConfig'
import { languageAtom } from '../../state'
import { BackLink } from '../components/BackLink'
import EventStateStepper from './EventStateStepper'

export default function Title({ event }: { readonly event: ConfirmedEvent }) {
  const { t } = useTranslation()
  const language = useAtomValue(languageAtom)
  const type = eventTypeLabel(event)
  const name = localizedEventName(event, language)

  return (
    <>
      {/* The way out of a trial the secretary opened from the list (KOE-541); the browser's own back
          button is the only one there was, and it is not where a way back is looked for. It shares
          the heading's row, because everything below is the entry list and a row spent here is a row
          taken from it — see BackLink for what happens to the words when the screen narrows. */}
      <Stack direction="row" sx={{ alignItems: 'flex-start', columnGap: 1 }}>
        <BackLink headingVariant="h5" label={t('backToEventsList')} to={Path.admin.events} />
        <Typography variant="h5">
          {type}, {t('dateFormat.datespan', { end: event.endDate, start: event.startDate })}, {event.location}
          {name ? ` (${name})` : ''}
        </Typography>
      </Stack>
      <EventStateStepper event={event} />
    </>
  )
}
