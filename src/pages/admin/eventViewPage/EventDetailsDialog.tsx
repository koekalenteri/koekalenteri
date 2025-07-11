import type { ConfirmedEvent, DogEvent } from '../../../types'

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { useSnackbar } from 'notistack'
import { useRecoilState, useResetRecoilState } from 'recoil'

import { hasChanges } from '../../../lib/utils'
import EventForm from '../components/EventForm'
import { adminEditableEventByIdAtom, adminEventSelector, useAdminEventActions } from '../recoil'

interface Props {
  readonly eventId: string
  readonly onClose?: () => void
  readonly open: boolean
}

export default function EventDetailsDialog({ eventId, onClose, open }: Props) {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const actions = useAdminEventActions()
  const [storedEvent, setStoredEvent] = useRecoilState(adminEventSelector(eventId))
  const [event, setEvent] = useRecoilState(adminEditableEventByIdAtom(eventId))
  const resetEvent = useResetRecoilState(adminEditableEventByIdAtom(eventId))
  const [changes, setChanges] = useState<boolean>(hasChanges(storedEvent, event))

  const handleChange = useCallback(
    (newState: DogEvent) => {
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

  const handleSave = useCallback(async () => {
    if (!event) {
      return
    }
    try {
      const saved = await actions.save(event)
      resetEvent()
      setStoredEvent(saved)
      enqueueSnackbar(t(`event.saved`), { variant: 'info' })
      onClose?.()
    } catch (error) {
      console.error(error)
    }
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
