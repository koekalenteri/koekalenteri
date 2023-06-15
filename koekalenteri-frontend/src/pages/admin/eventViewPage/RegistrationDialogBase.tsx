import { useCallback, useMemo } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@mui/material'
import { ConfirmedEvent, Event, Registration } from 'koekalenteri-shared/model'
import { Resetter, SetterOrUpdater } from 'recoil'

import { hasChanges } from '../../../utils'
import RegistrationForm from '../../components/RegistrationForm'
import { useAdminRegistrationActions } from '../recoil/registrations/actions'

interface Props {
  changes: boolean
  classDisabled?: boolean
  event: Event
  eventClass?: string
  onClose?: () => void
  open: boolean
  registration?: Registration
  resetRegistration: Resetter
  setRegistration: SetterOrUpdater<Registration | undefined>
}

export default function RegistrationDialogBase({
  changes,
  classDisabled,
  event,
  onClose,
  open,
  registration,
  resetRegistration,
  setRegistration,
}: Props) {
  const actions = useAdminRegistrationActions()

  const handleChange = useCallback(
    (newState: Registration) => {
      if (hasChanges(registration, newState)) {
        setRegistration(newState)
      }
    },
    [registration, setRegistration]
  )

  const handleSave = useCallback(() => {
    if (!registration || !event) {
      return
    }
    actions.save(registration).then(
      () => {
        resetRegistration()
        onClose?.()
      },
      (reason) => {
        console.error(reason)
      }
    )
  }, [actions, event, onClose, registration, resetRegistration])

  const handleCancel = useCallback(() => {
    resetRegistration()
    onClose?.()
  }, [onClose, resetRegistration])

  const title = useMemo(() => {
    if (registration?.dog?.name) {
      const handlerName = registration?.ownerHandles ? registration?.owner?.name : registration?.handler?.name ?? ''
      if (handlerName) {
        return `${registration.dog.name} / ${handlerName}`
      }
      return registration.dog.name
    }
    return ''
  }, [registration?.dog?.name, registration?.handler?.name, registration?.owner?.name, registration?.ownerHandles])

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
      <DialogTitle id="reg-dialog-title">{title}</DialogTitle>
      <DialogContent dividers sx={{ height: '100%', p: 0 }}>
        <RegistrationForm
          event={event as ConfirmedEvent}
          registration={registration}
          classDisabled={classDisabled}
          onSave={handleSave}
          onCancel={handleCancel}
          onChange={handleChange}
          changes={changes}
        />
      </DialogContent>
    </Dialog>
  )
}
