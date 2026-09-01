import type { PublicConfirmedEvent, Registration } from '../../types'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useTranslation } from 'react-i18next'
import { localizedEventName } from '../../lib/event'
import { languageAtom } from '../state'

interface Props {
  readonly event: PublicConfirmedEvent
  readonly registration: Registration
}

export const RegistrationDetails = ({ event, registration }: Props) => {
  const { t } = useTranslation()
  const language = useAtomValue(languageAtom)
  const name = localizedEventName(event, language)

  return (
    <Stack direction="row" justifyContent="start">
      <Box px={1}>
        <Typography variant="subtitle2" color="textSecondary">
          {t('eventInfo')}
        </Typography>
        <Typography variant="body1">
          {[
            event.eventType,
            t('dateFormat.datespan', { end: event.endDate, start: event.startDate }),
            event.location,
            name ? `(${name})` : '',
          ]
            .filter(Boolean)
            .join(' ')}
        </Typography>
        <Typography variant="subtitle2" color="textSecondary">
          {t('registration.dog')}
        </Typography>
        <Typography variant="body1">
          {registration.dog.regNo} {registration.dog.name}
        </Typography>
        <Typography variant="subtitle2" color="textSecondary">
          {t('registration.handler')}
        </Typography>
        <Typography variant="body1">{registration.handler?.name}</Typography>
      </Box>
    </Stack>
  )
}
