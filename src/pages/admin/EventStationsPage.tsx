import type { DogEvent, Patch } from '../../types'
import Cancel from '@mui/icons-material/Cancel'
import Save from '@mui/icons-material/Save'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { merge } from '../../lib/utils'
import { Path } from '../../routeConfig'
import { AsyncButton } from '../components/AsyncButton'
import EventNotFound from './components/EventNotFound'
import StationsEditor from './eventStationsPage/StationsEditor'
import useEventForm from './hooks/useEventForm'
import { adminEventAtom } from './state'

/**
 * Posts get their own page rather than a section of the event form: a course is usually laid out at the
 * venue, long after the event itself was filled in.
 */
export default function EventStationsPage() {
  const { t } = useTranslation()
  const { id: eventId = '' } = useParams()
  const storedEvent = useAtomValue(adminEventAtom(eventId))
  const { event, canSave, handleChange, handleSave, handleCancel } = useEventForm({
    eventId,
    onDoneRedirect: Path.admin.viewEvent(eventId),
    savedMessage: t('event.stationsSaved'),
    storedEvent,
  })

  // `useEventForm` stores whatever it is handed, so it must be handed a whole event. The editor emits a
  // patch, and passing that straight through would replace the stored event with just `{ stations }` —
  // losing its id, and leaving the page insisting the event does not exist. EventForm merges the same
  // way before calling on.
  const handleStationsChange = useCallback(
    (patch: Patch<DogEvent>) => {
      if (event) handleChange(merge<DogEvent>(event, patch))
    },
    [event, handleChange]
  )

  if (!event?.id) {
    return <EventNotFound />
  }

  return (
    <Paper
      elevation={2}
      sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100%', maxWidth: '100%' }}
    >
      <Box sx={{ pt: 2, px: 2 }}>
        <Typography variant="h6">{t('event.stationsSectionTitle')}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t('event.stationsInfo')}
        </Typography>
      </Box>
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
        <StationsEditor event={event} onChange={handleStationsChange} />
      </Box>
      <Stack
        spacing={1}
        direction="row"
        justifyContent="flex-end"
        sx={{ borderColor: '#bdbdbd', borderTop: '1px solid', p: 1 }}
      >
        <AsyncButton color="primary" disabled={!canSave} startIcon={<Save />} variant="contained" onClick={handleSave}>
          {t('save')}
        </AsyncButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={handleCancel}>
          {t('cancel')}
        </Button>
      </Stack>
    </Paper>
  )
}
