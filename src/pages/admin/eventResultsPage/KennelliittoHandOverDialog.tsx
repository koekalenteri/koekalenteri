import type { KcHandOverOutcome } from '../state/registrations/actions'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { KennelliittoDogList } from './KennelliittoDogList'
import { blockerText, dogLine } from './kennelliittoMessages'

interface Props {
  /** Accepts that the dogs listed as left out stay out of the hand-over. */
  readonly accepted: boolean
  readonly onAccept: (accepted: boolean) => void
  readonly onClose: () => void
  readonly onHandOver: () => void
  readonly open: boolean
  /** What the last try came to; none before the first one. */
  readonly outcome?: Exclude<KcHandOverOutcome, { kind: 'done' }>
}

/**
 * The last step: the trial goes to the chief judge and the secretary can no longer correct it. The
 * sentence about that is the reason for this dialog being separate from the sending.
 */
export const KennelliittoHandOverDialog = ({ accepted, onAccept, onClose, onHandOver, open, outcome }: Props) => {
  const { t } = useTranslation()
  const leftOut = outcome?.kind === 'confirmationNeeded' ? outcome.dogs : []

  return (
    <Dialog fullWidth maxWidth="sm" onClose={onClose} open={open}>
      <DialogTitle>{t('results.kennelliitto.handOver.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography>{t('results.kennelliitto.handOver.confirm')}</Typography>
          <Alert severity="info">{t('results.kennelliitto.handOver.certificates')}</Alert>
          {outcome?.kind === 'blocked' &&
            outcome.blockers.map((blocker) => (
              <Alert key={blocker.code} severity="warning">
                {blockerText(t, blocker)}
              </Alert>
            ))}
          {outcome?.kind === 'unsent' && (
            <Alert severity="error">
              <Typography sx={{ fontWeight: 600 }} variant="body2">
                {t('results.kennelliitto.handOver.unsent')}
              </Typography>
              <KennelliittoDogList lines={outcome.dogs.map((dog) => dogLine(t, dog))} />
            </Alert>
          )}
          {leftOut.length > 0 && (
            <Alert severity="warning">
              <Typography sx={{ fontWeight: 600 }} variant="body2">
                {t('results.kennelliitto.handOver.leftOut')}
              </Typography>
              <KennelliittoDogList lines={leftOut.map((dog) => dogLine(t, dog))} />
              <FormControlLabel
                control={<Checkbox checked={accepted} onChange={(_event, checked) => onAccept(checked)} size="small" />}
                label={t('results.kennelliitto.handOver.without', { count: leftOut.length })}
              />
            </Alert>
          )}
          {outcome?.kind === 'nothingSent' && (
            <Alert severity="warning">
              <Typography variant="body2">{t('results.kennelliitto.handOver.nothingSent')}</Typography>
              <FormControlLabel
                control={<Checkbox checked={accepted} onChange={(_event, checked) => onAccept(checked)} size="small" />}
                label={t('results.kennelliitto.handOver.nothingSentConfirm')}
              />
            </Alert>
          )}
          {outcome?.kind === 'unknown' && <Alert severity="error">{t('results.kennelliitto.handOver.unknown')}</Alert>}
          {outcome?.kind === 'refused' && (
            <Alert severity="error">
              {t('results.kennelliitto.handOver.refused', { reasons: outcome.virheet.join(' ') })}
            </Alert>
          )}
          {outcome?.kind === 'failed' && <Alert severity="error">{t('results.kennelliitto.handOver.failed')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button
          disabled={(leftOut.length > 0 || outcome?.kind === 'nothingSent') && !accepted}
          onClick={onHandOver}
          variant="contained"
        >
          {t('results.kennelliitto.handOverButton')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
