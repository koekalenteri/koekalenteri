import type { DogEvent } from '@/types'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { useAtomValue } from 'jotai'
import { useResetAtom } from 'jotai/utils'
import { useCallback } from 'react'
import { releaseFocus } from '@/lib/client/focus'
import { localizedEventName } from '@/lib/event'
import { languageAtom } from '../../state'
import DroppedTasksDialog from '../components/DroppedTasksDialog'
import EventForm from '../components/EventForm'
import useEventForm from '../hooks/useEventForm'
import { adminEditableEventByIdAndFormAtom, adminEventAtom } from '../state'

interface Props {
  readonly eventId: string
  readonly onClose?: () => void
  readonly open: boolean
}

interface FormProps {
  readonly eventId: string
  readonly onCancel: () => void
  readonly onSaved?: () => void
  readonly storedEvent: DogEvent
}

/**
 * The form mounts as the dialog opens, so it edits the event as stored then: the view keeps the dialog
 * from the start, and a save in between would otherwise send a stale stamp (KOE-1700).
 */
function EventDetailsForm({ eventId, onCancel, onSaved, storedEvent }: FormProps) {
  // No redirect: the dialog closes once the save has gone through, and stays open on a refusal or while
  // the secretary is asked about dropped scores (KOE-1666).
  const { event, changes, canSave, dropsDialogProps, handleChange, handleSave } = useEventForm({
    eventId,
    form: 'details',
    onSaved,
    storedEvent,
  })

  return (
    <>
      <EventForm
        event={event}
        changes={changes}
        canSave={canSave}
        onChange={handleChange}
        onCancel={onCancel}
        onSave={handleSave}
      />
      <DroppedTasksDialog {...dropsDialogProps} />
    </>
  )
}

export default function EventDetailsDialog({ eventId, onClose, open }: Props) {
  const storedEvent = useAtomValue(adminEventAtom(eventId))
  const language = useAtomValue(languageAtom)

  const discardDraft = useResetAtom(adminEditableEventByIdAndFormAtom({ eventId, form: 'details' }))

  // Cancel, Esc and a click outside all close the dialog the same way: the change is not kept (KOE-1700).
  // A value the focused field still holds back goes into the draft first, and is dropped with it.
  const cancel = useCallback(() => {
    releaseFocus()
    discardDraft()
    onClose?.()
  }, [discardDraft, onClose])

  if (!storedEvent?.id) {
    return null
  }

  return (
    <Dialog
      fullWidth
      maxWidth="lg"
      open={open}
      onClose={cancel}
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
      <DialogTitle id="reg-dialog-title">{localizedEventName(storedEvent, language)}</DialogTitle>
      <DialogContent dividers sx={{ height: '100%', p: 0 }}>
        {open && <EventDetailsForm eventId={eventId} onCancel={cancel} onSaved={onClose} storedEvent={storedEvent} />}
      </DialogContent>
    </Dialog>
  )
}
