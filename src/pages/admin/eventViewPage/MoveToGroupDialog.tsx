import type { DogEvent, Registration, RegistrationGroup } from '../../../types'
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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { eventRegistrationDateKey } from '../../../lib/event'
import { getRegistrationGroupKey } from '../../../lib/registration'
import { errorSnackbarOptions } from '../../../lib/snackbar'

interface Props {
  open: boolean
  onClose: () => void
  registration: Registration
  event: DogEvent
  groups: RegistrationGroup[]
  onMove: (groupKey: string) => Promise<void>
}

const getGroupLabel = (dateLabel: string, timeLabel: string | undefined, currentGroupLabel: string | undefined) =>
  `${dateLabel} ${timeLabel ?? ''}${currentGroupLabel ?? ''}`

export default function MoveToGroupDialog({
  open,
  onClose,
  registration,
  event: _event,
  groups,
  onMove,
}: Readonly<Props>) {
  const { t } = useTranslation()
  const currentGroupKey = getRegistrationGroupKey(registration)
  const [saving, setSaving] = useState(false)

  // Check if dog is registered for the selected group's date
  const isRegisteredForGroup = (groupKey: string) => {
    const group = groups.find((g) => g.key === groupKey)
    if (!group) return true // If no date specified, allow move

    if (!group.date) return true

    const dateKey = eventRegistrationDateKey({ ...group, date: group.date })
    return registration.dates?.some((d) => eventRegistrationDateKey(d) === dateKey) ?? false
  }

  const defaultSelectedGroup = useMemo(() => {
    const firstRegisteredGroup = groups.find((group) => {
      if (!group.date) return false

      const groupKey = eventRegistrationDateKey({ ...group, date: group.date })
      return registration.dates?.some((date) => eventRegistrationDateKey(date) === groupKey) ?? false
    })

    return firstRegisteredGroup ? firstRegisteredGroup.key : currentGroupKey
  }, [currentGroupKey, groups, registration.dates])

  const [selectedGroup, setSelectedGroup] = useState<string>(defaultSelectedGroup)

  useEffect(() => {
    if (open) {
      setSelectedGroup(defaultSelectedGroup)
    }
  }, [defaultSelectedGroup, open])

  const handleMove = async () => {
    if (!isRegisteredForGroup(selectedGroup)) {
      enqueueSnackbar(t('registration.moveToGroupDialog.notRegisteredForDay'), errorSnackbarOptions)
      return
    }

    setSaving(true)
    try {
      await onMove(selectedGroup)
      enqueueSnackbar(t('registration.moveToGroupDialog.moved', { name: registration.dog.name }), {
        variant: 'success',
      })
      onClose()
    } catch (error) {
      console.error('Failed to move registration:', error)
      enqueueSnackbar('Virhe siirrossa', errorSnackbarOptions)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('registration.moveToGroupDialog.title', { name: registration.dog.name })}</DialogTitle>
      <DialogContent>
        <FormControl component="fieldset" sx={{ mt: 2 }}>
          <FormLabel component="legend">{t('registration.moveToGroupDialog.selectGroup')}</FormLabel>
          <RadioGroup value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
            {groups.map((group) => {
              const groupKey = group.key
              const isCurrentGroup = groupKey === currentGroupKey
              const isRegistered = isRegisteredForGroup(groupKey)
              const dateLabel = t('dateFormat.wdshort', { date: group.date })
              const timeLabel = group.time ? t(`registration.timeLong.${group.time}`) : undefined
              const currentGroupLabel = isCurrentGroup
                ? ` ${t('registration.moveToGroupDialog.currentGroup')}`
                : undefined
              const label = getGroupLabel(dateLabel, timeLabel, currentGroupLabel)

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
