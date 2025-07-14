import type { ConfirmedEvent } from '../../../types'

import { useCallback } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { useRecoilState } from 'recoil'

import EventForm from '../components/EventForm'
import useEventForm from '../hooks/useEventForm'
import { adminEventSelector } from '../recoil'

interface Props {
  readonly eventId: string
  readonly onClose?: () => void
  readonly open: boolean
}

export default function EventDetailsDialog({ eventId, onClose, open }: Props) {
  const [storedEvent] = useRecoilState(adminEventSelector(eventId))

  // Use the hook with custom options
  const {
    event,
    changes,
    handleChange,
    handleSave: originalHandleSave,
    handleCancel: originalHandleCancel,
  } = useEventForm({
    eventId,
    storedEvent,
    // Don't provide onSaveRedirect to prevent navigation
  })

  // Override handleSave to close dialog but not navigate
  const handleSave = useCallback(async () => {
    try {
      await originalHandleSave()
      onClose?.()
    } catch (error) {
      console.error(error)
    }
  }, [originalHandleSave, onClose])

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
            m: 1,
            maxHeight: 'calc(100% - 16px)',
            width: 'calc(100% - 16px)',
            '& .MuiDialogTitle-root': {
              fontSize: '1rem',
            },
          },
        },
      }}
    >
      <DialogTitle id="reg-dialog-title">{event.name}</DialogTitle>
      <DialogContent dividers sx={{ height: '100%', p: 0 }}>
        <EventForm
          event={event as ConfirmedEvent}
          changes={changes}
          onChange={handleChange}
          onCancel={handleCancel}
          onSave={handleSave}
        />
      </DialogContent>
    </Dialog>
  )
}
