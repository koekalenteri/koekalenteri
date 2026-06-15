import type { EventKcIdChoice } from '../../../../api/event'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { useTranslation } from 'react-i18next'
import { zonedDateString } from '../../../../i18n/dates'

type Props = {
  readonly choices: EventKcIdChoice[]
  readonly onClose: () => void
  readonly onSelect: (choice: EventKcIdChoice) => void
}

export default function KcIdChoiceDialog({ choices, onClose, onSelect }: Props) {
  const { t } = useTranslation()

  return (
    <Dialog fullWidth maxWidth="md" open={choices.length > 0} onClose={onClose}>
      <DialogTitle>{t('event.kcIdChoiceTitle')}</DialogTitle>
      <DialogContent dividers sx={{ p: 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('event.kcIdChoiceId')}</TableCell>
              <TableCell>{t('event.kcIdChoiceType')}</TableCell>
              <TableCell>{t('event.kcIdChoiceTime')}</TableCell>
              <TableCell>{t('event.kcIdChoiceLocation')}</TableCell>
              <TableCell>{t('event.kcIdChoiceOrganizer')}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {choices.map((choice) => (
              <TableRow key={choice.id}>
                <TableCell>{choice.id}</TableCell>
                <TableCell>{[choice.eventType, choice.name].filter(Boolean).join(' ')}</TableCell>
                <TableCell>{formatDateSpan(choice)}</TableCell>
                <TableCell>{choice.location}</TableCell>
                <TableCell>{choice.organizer}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => onSelect(choice)}>
                    {t('event.kcIdSelect')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  )
}

function formatDateSpan(choice: EventKcIdChoice) {
  const startDate = zonedDateString(choice.startDate)
  const endDate = zonedDateString(choice.endDate)

  return startDate === endDate ? startDate : `${startDate} - ${endDate}`
}
