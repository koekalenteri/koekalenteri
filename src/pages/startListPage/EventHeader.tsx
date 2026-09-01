import type { PublicConfirmedEvent } from '../../types/Event'
import Grid from '@mui/material/Grid'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { localizedEventName } from '../../lib/event'
import { languageAtom } from '../state'

interface EventHeaderProps {
  event: PublicConfirmedEvent
  now: Date
}

export const EventHeader = ({ event, now }: EventHeaderProps) => {
  const { t } = useTranslation()
  const language = useAtomValue(languageAtom)
  const name = localizedEventName(event, language)

  return (
    <Grid container>
      <Grid display="flex" flexGrow={1}>
        <h1>
          {event.eventType} {event.location} {name ? `(${name})` : ''}
        </h1>
      </Grid>
      <Grid display="flex" justifyContent="end">
        {t('dateFormat.dtshort', { date: now })}
      </Grid>
    </Grid>
  )
}
