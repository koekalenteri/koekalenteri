import { useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Dialog, DialogContent, DialogTitle } from "@mui/material"
import { ConfirmedEvent, Registration } from "koekalenteri-shared/model"
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil"
import { getDiff } from "recursive-diff"

import RegistrationForm from "../../components/RegistrationForm"
import { editableRegistrationByIdAtom, eventSelector, registrationByIdAtom } from "../../recoil"
import { adminRegistrationIdAtom } from "../recoil"
import { useAdminRegistrationActions } from "../recoil/registrations/actions"

interface Props {
  open: boolean
  onClose?: () => void
}

export default function RegistraionEditDialog({open, onClose}: Props) {
  const registrationId = useRecoilValue(adminRegistrationIdAtom) ?? ''
  const [savedRegistration, setSavedRegistration] = useRecoilState(registrationByIdAtom(registrationId))
  const [registration, setRegistration] = useRecoilState(editableRegistrationByIdAtom(registrationId))
  const event = useRecoilValue(eventSelector(registration?.eventId))
  const resetRegistration = useResetRecoilState(editableRegistrationByIdAtom(registrationId))
  const actions = useAdminRegistrationActions()
  const changes = useMemo(() => !!savedRegistration && getDiff(savedRegistration, registration).length > 0, [registration, savedRegistration])

  const handleChange = useCallback((newState: Registration) => {
    const diff = getDiff(registration, newState)
    if (diff.length) {
      setRegistration(newState)
    }
  }, [registration, setRegistration])

  const handleSave = useCallback(async () => {
    if (!registration || !event) {
      return
    }
    const saved = await actions.save(registration)
    setSavedRegistration(saved)
    resetRegistration()
    onClose?.()
  }, [actions, event, onClose, registration, resetRegistration, setSavedRegistration])

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
      <DialogTitle id="reg-dialog-title">{`${registration.dog.name} / ${registration.handler.name}`}</DialogTitle>
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
