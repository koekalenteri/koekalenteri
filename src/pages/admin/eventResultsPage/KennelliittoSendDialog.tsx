import type { KcDogReport, KcPreviewResponse } from '@/lib/kennelliittoResults'
import type { KcSendSummary } from '../state/registrations/actions'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import LinearProgress from '@mui/material/LinearProgress'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { KennelliittoDogList } from './KennelliittoDogList'
import { blockerText, dogLabel, dogLine, skippedLine } from './kennelliittoMessages'

export type KcSendPhase =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'preview'; preview: KcPreviewResponse }
  | { kind: 'sending'; done: number; total: number }
  | { kind: 'report'; summary: KcSendSummary }

export type KcSendScope = 'all' | 'class'

interface Props {
  /** The class on show, which the sending can be limited to. */
  readonly eventClass?: string
  readonly force: boolean
  readonly onClose: () => void
  readonly onForce: (force: boolean) => void
  readonly onScope: (scope: KcSendScope) => void
  readonly onSend: () => void
  readonly open: boolean
  readonly phase: KcSendPhase
  readonly scope: KcSendScope
}

/** The dogs a sending would send: new and changed results, and the unchanged ones when forced. */
export const dogsToSend = (preview: KcPreviewResponse, force: boolean): KcDogReport[] =>
  preview.dogs.filter(
    (dog) => dog.status === 'ready' || dog.status === 'changed' || (force && dog.status === 'unchanged')
  )

const Preview = ({
  eventClass,
  force,
  onForce,
  onScope,
  preview,
  scope,
}: Pick<Props, 'eventClass' | 'force' | 'onForce' | 'onScope' | 'scope'> & { readonly preview: KcPreviewResponse }) => {
  const { t } = useTranslation()
  const count = (status: KcDogReport['status']) => preview.dogs.filter((dog) => dog.status === status).length

  if (preview.blockers.length) {
    return (
      <Stack spacing={1}>
        {preview.blockers.map((blocker) => (
          <Alert key={blocker.code} severity="warning">
            {blockerText(t, blocker)}
          </Alert>
        ))}
      </Stack>
    )
  }

  const blocked = preview.dogs.filter((dog) => dog.status === 'blocked')
  const summary = (['ready', 'changed', 'unchanged', 'notRecorded', 'blocked'] as const).filter((status) =>
    count(status)
  )

  return (
    <Stack spacing={2}>
      <Typography>{t('results.kennelliitto.confirm')}</Typography>
      <Alert severity="info">{t('results.kennelliitto.confirmNote')}</Alert>
      {eventClass && (
        <RadioGroup
          aria-label={t('results.kennelliitto.scope')}
          onChange={(_event, value) => onScope(value === 'class' ? 'class' : 'all')}
          row
          value={scope}
        >
          <FormControlLabel
            control={<Radio size="small" />}
            label={t('results.kennelliitto.scopeClass', { eventClass })}
            value="class"
          />
          <FormControlLabel control={<Radio size="small" />} label={t('results.kennelliitto.scopeAll')} value="all" />
        </RadioGroup>
      )}
      <Stack spacing={0.25}>
        {summary.map((status) => (
          <Typography key={status} variant="body2">
            {t(`results.kennelliitto.summary.${status}`, { count: count(status) })}
          </Typography>
        ))}
        {!summary.length && <Typography variant="body2">{t('results.kennelliitto.nothingToSend')}</Typography>}
      </Stack>
      {blocked.length > 0 && (
        <Alert severity="error">
          <KennelliittoDogList lines={blocked.map((dog) => dogLine(t, dog))} />
        </Alert>
      )}
      {count('unchanged') > 0 && (
        <FormControlLabel
          control={<Checkbox checked={force} onChange={(_event, checked) => onForce(checked)} size="small" />}
          label={t('results.kennelliitto.force')}
        />
      )}
    </Stack>
  )
}

/**
 * A sending cut short: by no answer, which may be the connection, or by an error the server answered
 * with, which is not, and says its status (KOE-1140).
 */
const Interrupted = ({ errorStatus }: { readonly errorStatus: KcSendSummary['errorStatus'] }) => {
  const { t } = useTranslation()
  if (errorStatus === undefined) return <Alert severity="warning">{t('results.kennelliitto.interrupted')}</Alert>
  return <Alert severity="error">{t('results.kennelliitto.serverError', { status: errorStatus })}</Alert>
}

const Report = ({ summary }: { readonly summary: KcSendSummary }) => {
  const { t } = useTranslation()
  const sent = summary.reports.filter((report) => report.outcome === 'sent')
  const failed = summary.reports.filter((report) => report.outcome === 'failed')
  const skipped = summary.reports.filter((report) => report.outcome === 'skipped')

  return (
    <Stack spacing={2}>
      {summary.blockers.map((blocker) => (
        <Alert key={blocker.code} severity="warning">
          {blockerText(t, blocker)}
        </Alert>
      ))}
      {summary.interrupted && <Interrupted errorStatus={summary.errorStatus} />}
      {sent.length > 0 && (
        <Alert severity="success">
          <Typography sx={{ fontWeight: 600 }} variant="body2">
            {t('results.kennelliitto.success', { count: sent.length })}
          </Typography>
          <Typography variant="body2">{sent.map(dogLabel).join(', ')}</Typography>
        </Alert>
      )}
      {failed.length > 0 && (
        <Alert severity="error">
          <Typography sx={{ fontWeight: 600 }} variant="body2">
            {t('results.kennelliitto.failure', { count: failed.length })}
          </Typography>
          <KennelliittoDogList
            lines={failed.map((report) => ({
              id: report.id,
              text: `${dogLabel(report)}: ${report.errors?.join(' ') ?? t('results.kennelliitto.statusUnknown', { status: report.status ?? 0 })}`,
            }))}
          />
        </Alert>
      )}
      {skipped.length > 0 && (
        <Alert severity="warning">
          <Typography sx={{ fontWeight: 600 }} variant="body2">
            {t('results.kennelliitto.skipped', { count: skipped.length })}
          </Typography>
          <KennelliittoDogList lines={skipped.map((report) => skippedLine(t, report))} />
        </Alert>
      )}
      {summary.notAttempted.length > 0 && !summary.interrupted && (
        <Alert severity="info">{t('results.kennelliitto.notAttempted', { count: summary.notAttempted.length })}</Alert>
      )}
    </Stack>
  )
}

/**
 * The confirmation before results go to Omakoira, and what came of them. Shows only what the secretary
 * can act on: what stops the trial, the dogs that cannot be sent and why, and afterwards who was
 * saved and who was refused with Kennelliitto's own words.
 */
export const KennelliittoSendDialog = ({
  eventClass,
  force,
  onClose,
  onForce,
  onScope,
  onSend,
  open,
  phase,
  scope,
}: Props) => {
  const { t } = useTranslation()
  const canSend =
    phase.kind === 'preview' && !phase.preview.blockers.length && dogsToSend(phase.preview, force).length > 0

  return (
    <Dialog fullWidth maxWidth="sm" onClose={onClose} open={open}>
      <DialogTitle>{t('results.kennelliitto.title')}</DialogTitle>
      <DialogContent>
        {phase.kind === 'loading' && <Typography>{t('results.kennelliitto.loading')}</Typography>}
        {phase.kind === 'failed' && (
          <Alert severity="error">{t('results.kennelliitto.statusUnknown', { status: 0 })}</Alert>
        )}
        {phase.kind === 'preview' && (
          <Preview
            eventClass={eventClass}
            force={force}
            onForce={onForce}
            onScope={onScope}
            preview={phase.preview}
            scope={scope}
          />
        )}
        {phase.kind === 'sending' && (
          <Stack spacing={1}>
            <Typography>{t('results.kennelliitto.sending', { done: phase.done, total: phase.total })}</Typography>
            <LinearProgress value={phase.total ? (phase.done * 100) / phase.total : 0} variant="determinate" />
          </Stack>
        )}
        {phase.kind === 'report' && <Report summary={phase.summary} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('results.kennelliitto.close')}</Button>
        {(phase.kind === 'preview' || phase.kind === 'loading') && (
          <Button disabled={!canSend} onClick={onSend} variant="contained">
            {t('results.kennelliitto.send')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
