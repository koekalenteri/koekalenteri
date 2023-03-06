import { useCallback, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@mui/material'
import { ConfirmedEvent, Event, Registration } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { hasChanges } from '../../../utils'
import RegistrationForm from '../../components/RegistrationForm'
import { currentAdminRegistrationSelector, editableCurrentAdminEventRegistrationByIdAtom } from '../recoil'
import { useAdminRegistrationActions } from '../recoil/registrations/actions'

interface Props {
  event: Event
  onClose?: () => void
  open: boolean
  registrationId: string
}

export default function RegistrationEditDialog({ event, registrationId, open, onClose }: Props) {
  const savedRegistration = useRecoilValue(currentAdminRegistrationSelector)
  const [registration, setRegistration] = useRecoilState(editableCurrentAdminEventRegistrationByIdAtom(registrationId))
  const resetRegistration = useResetRecoilState(editableCurrentAdminEventRegistrationByIdAtom(registrationId))
  const actions = useAdminRegistrationActions()
  const changes = useMemo(
    () => !!registration && !!savedRegistration && hasChanges(savedRegistration, registration),
    [registration, savedRegistration]
  )

  useEffect(() => {
    resetRegistration()
  }, [registrationId, savedRegistration, resetRegistration])

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
          changes={changes}
        />
      </DialogContent>
    </Dialog>
  )
}
