import type { ConfirmedEvent, Registration } from '../../../types'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import FormLabel from '@mui/material/FormLabel'
import Typography from '@mui/material/Typography'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useAdminEventRegistrationInfo from '../../../hooks/useAdminEventRegistrationsInfo'

interface Props {
  readonly event: ConfirmedEvent
  readonly onCancel: () => void
  readonly onContinue: (recipients: Registration[]) => void
  readonly open: boolean
  readonly registrations: Registration[]
}

/** A message goes to a class's participants or to its reserves, and often to several of both (KOE-1073). */
type RecipientKind = 'participants' | 'reserve'

const groupKey = (eventClass: string, kind: RecipientKind) => `${eventClass}:${kind}`

export default function MessageRecipientsDialog({ event, onCancel, onContinue, open, registrations }: Props) {
  const { t } = useTranslation()
  const { eventClasses, missingClasses, reserveByClass, selectedByClass } = useAdminEventRegistrationInfo(
    event,
    registrations
  )
  // A registration whose class is no longer in the trial still belongs to someone who needs the
  // message, so the classes are the ones the entry list shows, not the ones the trial declares.
  const groups = useMemo(
    () =>
      [...eventClasses, ...missingClasses].map((eventClass) => ({
        eventClass,
        participants: selectedByClass[eventClass] ?? [],
        reserve: reserveByClass[eventClass] ?? [],
      })),
    [eventClasses, missingClasses, reserveByClass, selectedByClass]
  )

  // Participants are who a message is usually for, so they start out picked; a reserve is a choice
  // the secretary makes on purpose. `undefined` means the secretary has not touched the choice yet,
  // which keeps a live entry-list update from undoing their picks.
  const [picked, setPicked] = useState<string[]>()
  const selected = useMemo(
    () =>
      picked ??
      groups
        .filter(({ participants }) => participants.length)
        .map(({ eventClass }) => groupKey(eventClass, 'participants')),
    [groups, picked]
  )

  const recipients = useMemo(() => {
    const byId = new Map<string, Registration>()
    for (const { eventClass, participants, reserve } of groups) {
      if (selected.includes(groupKey(eventClass, 'participants'))) {
        for (const registration of participants) byId.set(registration.id, registration)
      }
      if (selected.includes(groupKey(eventClass, 'reserve'))) {
        for (const registration of reserve) byId.set(registration.id, registration)
      }
    }
    return [...byId.values()]
  }, [groups, selected])

  const toggle = (key: string) =>
    setPicked(selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key])

  const handleCancel = () => {
    setPicked(undefined)
    onCancel()
  }

  const handleContinue = () => {
    setPicked(undefined)
    onContinue(recipients)
  }

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{t('eventManagement.message.title')}</DialogTitle>
      <DialogContent>
        {groups.map(({ eventClass, participants, reserve }) => (
          <FormControl component="fieldset" key={eventClass} sx={{ display: 'block', mt: 1 }}>
            <FormLabel component="legend">{eventClass}</FormLabel>
            <FormGroup sx={{ mx: 2 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selected.includes(groupKey(eventClass, 'participants'))}
                    disabled={!participants.length}
                    onChange={() => toggle(groupKey(eventClass, 'participants'))}
                    size="small"
                  />
                }
                label={t('eventManagement.message.participants', { num: participants.length })}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selected.includes(groupKey(eventClass, 'reserve'))}
                    disabled={!reserve.length}
                    onChange={() => toggle(groupKey(eventClass, 'reserve'))}
                    size="small"
                  />
                }
                label={t('eventManagement.message.reserve', { num: reserve.length })}
              />
            </FormGroup>
          </FormControl>
        ))}
        <Typography sx={{ mt: 2 }} variant="subtitle2">
          {t('eventManagement.message.recipients', { num: recipients.length })}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button disabled={!recipients.length} onClick={handleContinue} variant="contained">
          {t('eventManagement.message.continue')}
        </Button>
        <Button onClick={handleCancel} variant="outlined">
          {t('cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
