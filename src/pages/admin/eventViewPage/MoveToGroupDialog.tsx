import type { DogEvent, Registration, RegistrationDate } from '../../../types'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormLabel from '@mui/material/FormLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import { enqueueSnackbar } from 'notistack'

import { eventRegistrationDateKey } from '../../../lib/event'
import { getRegistrationGroupKey } from '../../../lib/registration'

interface Props {
  open: boolean
  onClose: () => void
  registration: Registration
  event: DogEvent
  groups: RegistrationDate[]
  onMove: (groupKey: string) => Promise<void>
}

export default function MoveToGroupDialog({ open, onClose, registration, event: _event, groups, onMove }: Props) {
  const { t } = useTranslation()
  const currentGroupKey = getRegistrationGroupKey(registration)
  const [selectedGroup, setSelectedGroup] = useState<string>(currentGroupKey)
  const [saving, setSaving] = useState(false)

  // Check if dog is registered for the selected group's date
  const isRegisteredForGroup = (groupKey: string) => {
    const group = groups.find((g) => eventRegistrationDateKey(g) === groupKey)
    if (!group) return true // If no date specified, allow move

    return registration.dates?.some((d) => eventRegistrationDateKey(d) === groupKey) ?? false
  }

  const handleMove = async () => {
    if (!isRegisteredForGroup(selectedGroup)) {
      enqueueSnackbar(t('registration.moveToGroupDialog.notRegisteredForDay'), { variant: 'error' })
      return
    }

    setSaving(true)
    try {
      await onMove(selectedGroup)
      enqueueSnackbar(t('registration.moveToGroupDialog.moved'), { variant: 'success' })
      onClose()
    } catch (error) {
      console.error('Failed to move registration:', error)
      enqueueSnackbar('Virhe siirrossa', { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('registration.moveToGroupDialog.title')}</DialogTitle>
      <DialogContent>
        <FormControl component="fieldset" sx={{ mt: 2 }}>
          <FormLabel component="legend">{t('registration.moveToGroupDialog.selectGroup')}</FormLabel>
          <RadioGroup value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
            {groups.map((group) => {
              const groupKey = eventRegistrationDateKey(group)
              const isCurrentGroup = groupKey === currentGroupKey
              const isRegistered = isRegisteredForGroup(groupKey)
              const label = `${t('dateFormat.wdshort', { date: group.date })} ${group.time ? t(`registration.timeLong.${group.time}`) : ''}${isCurrentGroup ? ` ${t('registration.moveToGroupDialog.currentGroup')}` : ''}`

              return (
                <FormControlLabel
                  key={groupKey}
                  value={groupKey}
                  control={<Radio />}
                  label={label}
                  disabled={!isRegistered}
                />
              )
            })}
          </RadioGroup>
        </FormControl>
        {!isRegisteredForGroup(selectedGroup) && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {t('registration.moveToGroupDialog.notRegisteredForDay')}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('close')}</Button>
        <Button onClick={handleMove} variant="contained" disabled={saving || selectedGroup === currentGroupKey}>
          {t('registration.moveToGroupDialog.moveToGroup')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
