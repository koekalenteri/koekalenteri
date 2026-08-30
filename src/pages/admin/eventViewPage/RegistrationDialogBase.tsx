import type { RESET } from 'jotai/utils'
import type { AuditRecord, ConfirmedEvent, DogEvent, Registration } from '../../../types'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useSnackbar } from 'notistack'
import { useCallback } from 'react'
import { errorSnackbarOptions } from '../../../lib/client/snackbar'
import { getHandlingPerson } from '../../../lib/registration'
import { hasChanges } from '../../../lib/utils'
import { Path } from '../../../routeConfig'
import RegistrationForm from '../../components/RegistrationForm'
import { AuditTrail } from '../components/AuditTrail'
import { useAdminRegistrationActions } from '../state/registrations/actions'

interface Props {
  readonly auditTrail?: AuditRecord[]
  readonly changes: boolean
  readonly classDisabled?: boolean
  readonly event: DogEvent
  readonly onClose?: () => void
  readonly open: boolean
  readonly registration?: Registration
  readonly savedRegistration?: Registration
  readonly patchBase?: Registration
  readonly resetRegistration: () => void
  readonly setRegistration: (value: Registration | undefined | typeof RESET) => void
}

export default function RegistrationDialogBase({
  auditTrail,
  changes,
  classDisabled,
  event,
  onClose,
  open,
  registration,
  savedRegistration,
  patchBase,
  resetRegistration,
  setRegistration,
}: Props) {
  const actions = useAdminRegistrationActions(event.id)
  const { enqueueSnackbar } = useSnackbar()

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
    try {
      const saved = patchBase ? await actions.save(registration, patchBase) : await actions.save(registration)
      if (!saved) return
      resetRegistration()
      onClose?.()
    } catch (error) {
      enqueueSnackbar('Ilmoittautumisen tallennus epäonnistui', errorSnackbarOptions)
      console.error(error)
    }
  }, [actions, enqueueSnackbar, event, onClose, patchBase, registration, resetRegistration])

  // Internal notes bypass the form's save: an ordinary registration save mails the registrant about
  // the change, and a secretary's note must not reach them. The edited copy is kept in step so that
  // a later form save does not patch the note back to the value it had when the dialog opened.
  const handleInternalNotesChange = useCallback(
    async (internalNotes: string) => {
      if (!registration?.id) return
      setRegistration({ ...registration, internalNotes })
      await actions.putInternalNotes(registration.eventId, registration.id, internalNotes)
    },
    [actions, registration, setRegistration]
  )

  const handleCancel = useCallback(() => {
    resetRegistration()
    onClose?.()
  }, [onClose, resetRegistration])

  const prefix = registration?.cancelled ? 'PERUTTU: ' : ''
  const handlerName = registration ? (getHandlingPerson(registration)?.name ?? '') : ''
  const title = registration?.dog?.name
    ? `${prefix}${registration.dog.name}${handlerName ? ` / ${handlerName}` : ''}`
    : ''

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
      <DialogTitle id="reg-dialog-title">
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          {title} ({registration.language})
          <Typography variant="caption">
            <a target="_blank" href={Path.registration(registration)} rel="noopener">
              {registration.id}
            </a>
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent dividers sx={{ height: '100%', p: 0 }}>
        <RegistrationForm
          admin
          changes={changes}
          classDisabled={classDisabled}
          disabled={registration.cancelled}
          event={event as ConfirmedEvent}
          onCancel={handleCancel}
          onChange={handleChange}
          onInternalNotesChange={handleInternalNotesChange}
          onSave={handleSave}
          registration={registration}
          savedRegistration={savedRegistration}
        />
        <AuditTrail auditTrail={auditTrail} />
      </DialogContent>
    </Dialog>
  )
}
