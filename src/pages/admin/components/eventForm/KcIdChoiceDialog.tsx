import type { EventKcIdChoice } from '@/types'
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
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { zonedDateString } from '@/i18n/dates'

/** Text for screen readers only: the column of buttons has a name, and none to look at. */
const VISUALLY_HIDDEN = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: 1,
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: 1,
} as const

type Props = {
  readonly choices: EventKcIdChoice[]
  readonly linkedKcGuids?: ReadonlySet<string>
  readonly onClose: () => void
  readonly onSelect: (choice: EventKcIdChoice) => void
}

export default function KcIdChoiceDialog({ choices, linkedKcGuids, onClose, onSelect }: Props) {
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
              <TableCell>{t('event.kcIdChoiceClasses')}</TableCell>
              <TableCell>{t('event.kcIdChoiceTime')}</TableCell>
              <TableCell>{t('event.kcIdChoiceLocation')}</TableCell>
              <TableCell>{t('event.kcIdChoiceOrganizer')}</TableCell>
              <TableCell>{t('event.kcIdChoiceStatus')}</TableCell>
              <TableCell>
                <span style={VISUALLY_HIDDEN}>{t('event.kcIdSelect')}</span>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {choices.map((choice, index) => (
              // The index is part of the key: two trials without a GUID can be alike in everything shown.
              // biome-ignore lint/suspicious/noArrayIndexKey: the list is never reordered while it is open
              <TableRow key={`${choice.kcGuid ?? choice.kcTunnus ?? ''}|${choice.startDate.getTime()}|${index}`}>
                <TableCell>{choice.kcTunnus ?? '-'}</TableCell>
                <TableCell>{[choice.eventType, choice.name].filter(Boolean).join(' ')}</TableCell>
                <TableCell>{choice.classes.join(', ')}</TableCell>
                <TableCell>{formatDateSpan(choice)}</TableCell>
                <TableCell>{choice.location}</TableCell>
                <TableCell>{choice.organizer}</TableCell>
                <TableCell>{choice.status}</TableCell>
                <TableCell align="right">
                  <ChoiceAction choice={choice} linkedKcGuids={linkedKcGuids} onSelect={onSelect} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose}>
          {t('close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

type ActionProps = Pick<Props, 'linkedKcGuids' | 'onSelect'> & { readonly choice: EventKcIdChoice }

/** A trial without a GUID is shown but cannot be linked: Kennelliitto has not given it an identifier yet. */
function ChoiceAction({ choice, linkedKcGuids, onSelect }: ActionProps) {
  const { t } = useTranslation()

  if (!choice.kcGuid) {
    return (
      <Typography variant="caption" color="text.secondary">
        {t('event.kcGuidMissing')}
      </Typography>
    )
  }
  if (linkedKcGuids?.has(choice.kcGuid)) {
    return (
      <Typography variant="caption" color="error">
        {t('event.kcIdChoiceLinked')}
      </Typography>
    )
  }
  return (
    <Button variant="contained" size="small" onClick={() => onSelect(choice)}>
      {t('event.kcIdSelect')}
    </Button>
  )
}

function formatDateSpan(choice: EventKcIdChoice) {
  const startDate = zonedDateString(choice.startDate)
  const endDate = zonedDateString(choice.endDate)

  return startDate === endDate ? startDate : `${startDate} - ${endDate}`
}
