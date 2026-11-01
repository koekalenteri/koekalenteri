import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { useAtom, useAtomValue } from 'jotai'
import { useCallback } from 'react'
import { localizedEventName } from '@/lib/event'
import { languageAtom } from '../../state'
import DroppedTasksDialog from '../components/DroppedTasksDialog'
import EventForm from '../components/EventForm'
import useEventForm from '../hooks/useEventForm'
import { adminEventAtom } from '../state'

interface Props {
  readonly eventId: string
  readonly onClose?: () => void
  readonly open: boolean
}

export default function EventDetailsDialog({ eventId, onClose, open }: Props) {
  const [storedEvent] = useAtom(adminEventAtom(eventId))
  const language = useAtomValue(languageAtom)

  // No redirect: the dialog closes once the save has gone through, and stays open on a refusal or while
  // the secretary is asked about dropped scores (KOE-1666).
  const {
    event,
    changes,
    canSave,
    dropsDialogProps,
    handleChange,
    handleSave,
    handleCancel: originalHandleCancel,
  } = useEventForm({
    eventId,
    onSaved: onClose,
    storedEvent,
  })

  // Override handleCancel to close dialog but not navigate
  const handleCancel = useCallback(() => {
    originalHandleCancel()
    onClose?.()
  }, [originalHandleCancel, onClose])

  if (!event?.id) {
    return null
  }

  return (
    <Dialog
      fullWidth
      maxWidth="lg"
      open={open}
      onClose={onClose}
      aria-labelledby="reg-dialog-title"
      slotProps={{
        paper: {
          sx: {
            '& .MuiDialogTitle-root': {
              fontSize: '1rem',
            },
            m: 1,
            maxHeight: 'calc(100% - 16px)',
            width: 'calc(100% - 16px)',
          },
        },
      }}
    >
      <DialogTitle id="reg-dialog-title">{localizedEventName(event, language)}</DialogTitle>
      <DialogContent dividers sx={{ height: '100%', p: 0 }}>
        <EventForm
          event={event}
          changes={changes}
          canSave={canSave}
          onChange={handleChange}
          onCancel={handleCancel}
          onSave={handleSave}
        />
        <DroppedTasksDialog {...dropsDialogProps} />
      </DialogContent>
    </Dialog>
  )
}
