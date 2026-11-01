import type { DroppedTasksDog } from '@/lib/results'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import { useTranslation } from 'react-i18next'
import { AsyncButton } from '../../components/AsyncButton'

export interface DroppedTasksDialogProps {
  readonly dogs: readonly DroppedTasksDog[]
  readonly open: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => Promise<void>
}

/**
 * Asks before an event save drops recorded scores (KOE-1666): a change of the posts, the rotation or the
 * classes that leaves a recorded task out of a dog's round, or makes its slot mean another task. The
 * dogs are the ones the save named, so what is confirmed is what the server would drop.
 */
export default function DroppedTasksDialog({ dogs, open, onCancel, onConfirm }: DroppedTasksDialogProps) {
  const { t } = useTranslation()

  const line = (dog: DroppedTasksDog) => {
    const values = { count: dog.tasks, dog: dog.name, eventClass: dog.class ?? '' }
    return dog.number === undefined
      ? t('event.resultTasksDropped.dogWithoutNumber', values)
      : t('event.resultTasksDropped.dog', { ...values, number: dog.number })
  }

  return (
    <Dialog open={open} onClose={onCancel} aria-labelledby="dropped-tasks-title" maxWidth="sm" fullWidth>
      <DialogTitle id="dropped-tasks-title">{t('event.resultTasksDropped.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t('event.resultTasksDropped.body')}</DialogContentText>
        <List dense>
          {dogs.map((dog) => (
            <ListItem key={dog.id} disableGutters>
              <ListItemText primary={line(dog)} />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t('cancel')}</Button>
        <AsyncButton color="error" onClick={onConfirm} variant="contained">
          {t('event.resultTasksDropped.confirm')}
        </AsyncButton>
      </DialogActions>
    </Dialog>
  )
}
