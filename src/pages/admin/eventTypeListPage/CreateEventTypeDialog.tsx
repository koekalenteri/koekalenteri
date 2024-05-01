import type { EventType } from '../../../types'

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { useRecoilValue } from 'recoil'

import { eventTypesAtom, useAdminEventTypeActions } from '../recoil'

interface Props {
  readonly onClose: () => void
  readonly open: boolean
}

export function CreateEventTypeDialog({ onClose, open }: Props) {
  const actions = useAdminEventTypeActions()
  const { t } = useTranslation()
  const existing = useRecoilValue(eventTypesAtom)
  const existingTypes = useMemo(() => existing.map((et) => et.eventType), [existing])
  const [eventType, setEventType] = useState<string>('')
  const [description, setDescription] = useState<EventType['description']>({ fi: '', en: '', sv: '' })

  const onSave = useCallback(() => {
    if (!eventType || existingTypes.includes(eventType) || !description.fi || !description.en) return
    actions.save({ eventType, description, official: false, active: true }).then(
      () => onClose(),
      (reason) => console.error(reason)
    )
  }, [actions, description, eventType, existingTypes, onClose])

  return (
    <Dialog
      fullWidth
      maxWidth="sm"
      open={open}
      onClose={onClose}
      aria-labelledby="create-eventtype-dialog-title"
      aria-describedby="create-eventtype-dialog-description"
    >
      <DialogTitle id="create-eventtype-dialog-title">{t('eventType.createDialog.title')}</DialogTitle>
      <DialogContent>
        <Box
          component="form"
          sx={{
            '& .MuiTextField-root': { m: 1, width: '100%' },
          }}
          noValidate
          autoComplete="off"
        >
          <TextField
            value={eventType}
            onChange={(event) => setEventType(event.target.value.toLocaleUpperCase())}
            label={t('eventType.createDialog.eventType')}
            error={!eventType || existingTypes.includes(eventType)}
          />
          <TextField
            value={description.fi}
            onChange={(event) => setDescription({ ...description, fi: event.target.value })}
            label={t('eventType.createDialog.description.fi')}
            error={!description.fi}
          />
          <TextField
            value={description.en}
            onChange={(event) => setDescription({ ...description, en: event.target.value })}
            label={t('eventType.createDialog.description.en')}
            error={!description.en}
          />
          <TextField
            value={description.sv}
            onChange={(event) => setDescription({ ...description, sv: event.target.value })}
            label={t('eventType.createDialog.description.sv')}
            error={!description.sv}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onSave} variant="contained" disabled={!eventType || !description.fi || !description.en}>
          Tallenna
        </Button>
        <Button onClick={onClose} variant="outlined">
          t{'cancel'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
