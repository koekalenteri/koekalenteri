import { useCallback, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@mui/material'
import { diff } from 'deep-object-diff'
import { ConfirmedEvent, Registration } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { hasChanges } from '../../../utils'
import RegistrationForm from '../../components/RegistrationForm'
import { currentAdminEventSelector, currentAdminRegistrationSelector, editableCurrentAdminEventRegistrationByIdAtom } from '../recoil'
import { useAdminRegistrationActions } from '../recoil/registrations/actions'

interface Props {
  open: boolean
  registrationId: string
  onClose?: () => void
}

export default function RegistraionEditDialog({registrationId, open, onClose}: Props) {
  const event = useRecoilValue(currentAdminEventSelector)
  const savedRegistration = useRecoilValue(currentAdminRegistrationSelector)
  const [registration, setRegistration] = useRecoilState(editableCurrentAdminEventRegistrationByIdAtom(registrationId))
  const resetRegistration = useResetRecoilState(editableCurrentAdminEventRegistrationByIdAtom(registrationId))
  const actions = useAdminRegistrationActions()
  const changes = useMemo(() => !!registration && !!savedRegistration && hasChanges(savedRegistration, registration), [registration, savedRegistration])

  useEffect(() => {
    resetRegistration()
  }, [registrationId, savedRegistration, resetRegistration])

  const handleChange = useCallback((newState: Registration) => {
    console.log('diff', diff(registration ?? {}, newState))
    if (hasChanges(registration, newState)) {
      setRegistration(newState)
    }
  }, [registration, setRegistration])

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

  if (!registration) {
    return null
  }

  return (
    <Dialog
      fullWidth
      maxWidth='lg'
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
      <DialogTitle id="reg-dialog-title">{`${registration?.dog?.name} / ${registration?.handler?.name}`}</DialogTitle>
      <DialogContent dividers sx={{height: '100%', p: 0 }}>
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
