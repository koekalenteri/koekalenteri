import type { ConfirmedEvent, Event } from 'koekalenteri-shared/model'

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { useSnackbar } from 'notistack'
import { useRecoilState, useResetRecoilState } from 'recoil'

import { hasChanges } from '../../../utils'
import EventForm from '../components/EventForm'
import { adminEventSelector, editableEventByIdAtom, useAdminEventActions } from '../recoil'

interface Props {
  eventId: string
  onClose?: () => void
  open: boolean
}

export default function EventDetailsDialog({ eventId, onClose, open }: Props) {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const actions = useAdminEventActions()
  const [storedEvent, setStoredEvent] = useRecoilState(adminEventSelector(eventId))
  const [event, setEvent] = useRecoilState(editableEventByIdAtom(eventId))
  const resetEvent = useResetRecoilState(editableEventByIdAtom(eventId))
  const [changes, setChanges] = useState<boolean>(hasChanges(storedEvent, event))

  const handleChange = useCallback(
    (newState: Event) => {
      setChanges(hasChanges(storedEvent, newState))
      setEvent(newState)
    },
    [setEvent, storedEvent]
  )

  const handleCancel = useCallback(() => {
    resetEvent()
    setChanges(false)
    onClose?.()
  }, [onClose, resetEvent])

  const handleSave = useCallback(() => {
    if (!event) {
      return
    }
    actions.save(event).then(
      (saved) => {
        resetEvent()
        setStoredEvent(saved)
        enqueueSnackbar(t(`event.saved`), { variant: 'info' })
        onClose?.()
      },
      (reason) => {
        console.error(reason)
      }
    )
  }, [actions, enqueueSnackbar, event, onClose, resetEvent, setStoredEvent, t])

  if (!event) {
    return null
  }

  return (
    <Dialog
      fullWidth
      maxWidth="lg"
      open={open}
      onClose={onClose}
      aria-labelledby="reg-dialog-title"
      PaperProps={{
        sx: {
          m: 1,
          maxHeight: 'calc(100% - 16px)',
          width: 'calc(100% - 16px)',
          '& .MuiDialogTitle-root': {
            fontSize: '1rem',
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
