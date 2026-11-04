import type { DogEvent, Patch } from '../../types'
import Cancel from '@mui/icons-material/Cancel'
import Save from '@mui/icons-material/Save'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'
import { merge } from '../../lib/utils'
import { Path } from '../../routeConfig'
import { AsyncButton } from '../components/AsyncButton'
import DroppedTasksDialog from './components/DroppedTasksDialog'
import { EntryPageHeader } from './components/EntryPageHeader'
import EventNotFound from './components/EventNotFound'
import StationsEditor from './eventStationsPage/StationsEditor'
import { useRotationErrors } from './eventStationsPage/useRotationErrors'
import useEventForm from './hooks/useEventForm'
import { adminEventAtom } from './state'
import { useAdminEventScope } from './state/eventScope'

/**
 * Posts get their own page rather than a section of the event form: a course is usually laid out at the
 * venue, long after the event itself was filled in.
 */
export default function EventStationsPage() {
  const { t } = useTranslation()
  const { id: eventId = '' } = useParams()
  useAdminEventScope(eventId)
  const storedEvent = useAtomValue(adminEventAtom(eventId))
  const { event, canSave, discardChanges, dropsDialogProps, handleChange, handleSave, handleCancel } = useEventForm({
    eventId,
    onDoneRedirect: Path.admin.viewEvent(eventId),
    savedMessage: t('event.stationsSaved'),
    storedEvent,
  })

  // The draft lives in session storage, so leaving has to lose it as the question says it will; it would
  // otherwise wait unseen behind the old posts on the event view (KOE-1699).
  useUnsavedChangesWarning(canSave, discardChanges)

  // A rotation that leaves a dog out, or that the server would refuse, is not saved (KOE-1665).
  const rotationErrors = useRotationErrors(eventId, event)

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
      {/* The trial as stored: the draft is shared with the event form and can hold an unsaved name or day.
          An event no longer in the list reads as a new one with no id, and then the draft is all there is. */}
      <EntryPageHeader event={storedEvent?.id ? storedEvent : event} title={t('event.stationsSectionTitle')}>
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
          }}
        >
          {t('event.stationsInfo')}
        </Typography>
      </EntryPageHeader>
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
        <StationsEditor event={event} onChange={handleStationsChange} />
      </Box>
      {rotationErrors.length > 0 && (
        <Alert severity="error" sx={{ mx: 2 }}>
          <AlertTitle>{t('event.rotation.errorsTitle')}</AlertTitle>
          {rotationErrors.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </Alert>
      )}
      <Stack
        spacing={1}
        direction="row"
        sx={{
          borderColor: '#bdbdbd',
          borderTop: '1px solid',
          justifyContent: 'flex-end',
          p: 1,
        }}
      >
        <AsyncButton
          color="primary"
          disabled={!canSave || rotationErrors.length > 0}
          startIcon={<Save />}
          variant="contained"
          onClick={handleSave}
        >
          {t('save')}
        </AsyncButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={handleCancel}>
          {t('cancel')}
        </Button>
      </Stack>
      <DroppedTasksDialog {...dropsDialogProps} />
    </Paper>
  )
}
