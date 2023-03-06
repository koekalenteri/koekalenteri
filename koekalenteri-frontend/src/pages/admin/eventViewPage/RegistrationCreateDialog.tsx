import { useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@mui/material'
import { ConfirmedEvent, Event, Registration } from 'koekalenteri-shared/model'
import { useRecoilState, useResetRecoilState } from 'recoil'

import { hasChanges } from '../../../utils'
import RegistrationForm from '../../components/RegistrationForm'
import { newRegistrationAtom } from '../../recoil'
import { useAdminRegistrationActions } from '../recoil/registrations/actions'

interface Props {
  event: Event
  eventClass?: string
  open: boolean
  registrationId: string
  onClose?: () => void
}

export default function RegistrationCreateDialog({ event, eventClass, open, onClose }: Props) {
  const [registration, setRegistration] = useRecoilState(newRegistrationAtom)
  const resetRegistration = useResetRecoilState(newRegistrationAtom)
  const actions = useAdminRegistrationActions()

  const handleChange = useCallback(
    (newState: Registration) => {
      if (hasChanges(registration, newState)) {
        setRegistration(newState)
      }
    },
    [registration, setRegistration]
  )

  const handleSave = useCallback(async () => {
    if (!registration || !event) {
      return
    }
    await actions.save(registration)
    resetRegistration()
    onClose?.()
  }, [actions, event, onClose, registration, resetRegistration])

  const handleCancel = useCallback(async () => {
    resetRegistration()
    onClose?.()
  }, [onClose, resetRegistration])

  useEffect(() => {
    if (!registration) {
      return
    }
    if (
      registration.eventId !== event.id ||
      registration.eventType !== event.eventType ||
      (eventClass && registration.class !== eventClass)
    ) {
      setRegistration({ ...registration, eventId: event.id, eventType: event.eventType, class: eventClass })
    }
  }, [registration, event, setRegistration, eventClass])

  const handlerName = registration?.ownerHandles ? registration.owner?.name : registration?.handler?.name

  if (!registration) {
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
      <DialogTitle id="reg-dialog-title">{`${registration?.dog?.name} / ${handlerName}`}</DialogTitle>
      <DialogContent dividers sx={{ height: '100%', p: 0 }}>
        <RegistrationForm
          event={event as ConfirmedEvent}
          registration={registration}
          onSave={handleSave}
          onCancel={handleCancel}
          onChange={handleChange}
          changes
        />
      </DialogContent>
    </Dialog>
  )
}
