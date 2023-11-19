import type { Resetter, SetterOrUpdater } from 'recoil'
import type { AuditRecord, ConfirmedEvent, DogEvent, Registration } from '../../../types'

import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'

import { hasChanges } from '../../../utils'
import CollapsibleSection from '../../components/CollapsibleSection'
import RegistrationForm from '../../components/RegistrationForm'
import { useAdminRegistrationActions } from '../recoil/registrations/actions'

interface Props {
  readonly changes: boolean
  readonly classDisabled?: boolean
  readonly event: DogEvent
  readonly onClose?: () => void
  readonly open: boolean
  readonly registration?: Registration
  readonly auditTrail?: AuditRecord[]
  readonly resetRegistration: Resetter
  readonly setRegistration: SetterOrUpdater<Registration | undefined>
}

export default function RegistrationDialogBase({
  changes,
  classDisabled,
  event,
  onClose,
  open,
  registration,
  auditTrail,
  resetRegistration,
  setRegistration,
}: Props) {
  const { t } = useTranslation()
  const actions = useAdminRegistrationActions(event.id)

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
        {auditTrail ? (
          <CollapsibleSection title={`Audit trail (${auditTrail.length})`} initOpen={false}>
            <List dense>
              {auditTrail.map((at, i) => (
                <ListItem key={i}>
                  <ListItemText
                    primary={`${t('dateFormat.long', { date: at.timestamp, defaultValue: '?' })} ${at.message}`}
                    secondary={at.user}
                  />
                </ListItem>
              ))}
            </List>
          </CollapsibleSection>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
