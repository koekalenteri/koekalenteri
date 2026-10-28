import type { KcDogReport, KcPreviewResponse } from '@/lib/kennelliittoResults'
import type { KcSendSummary } from '../../state/registrations/actions'
import type { KcRegNoDecision, KcRegNoDecisions, KcRegNoRow } from './KennelliittoRegNoChoices'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { KennelliittoDogList } from './KennelliittoDogList'
import { isEveryRegNoDecided, KennelliittoRegNoChoices } from './KennelliittoRegNoChoices'
import { blockerText, createsDogLine, dogLabel, dogLine, failedLine, skippedLine } from './kennelliittoMessages'

export type KcSendPhase =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'preview'; preview: KcPreviewResponse }
  /** The dogs Kennelliitto knows by another number, to decide about before the sending (KOE-1653). */
  | { kind: 'regNos'; preview: KcPreviewResponse; rows: KcRegNoRow[] }
  | { kind: 'sending'; done: number; total: number }
  /**
   * What the server said of the dogs asked for, and beside it the dogs the preview said cannot be sent,
   * which are never asked for and so have no report of their own (KOE-1656).
   */
  | { kind: 'report'; summary: KcSendSummary; blocked: KcDogReport[] }

interface Props {
  readonly decisions: KcRegNoDecisions
  readonly force: boolean
  /** Back from the choices to the preview, changing and sending nothing. */
  readonly onBack: () => void
  readonly onClose: () => void
  readonly onDecide: (id: string, decision: KcRegNoDecision) => void
  readonly onForce: (force: boolean) => void
  readonly onSend: () => void
  readonly open: boolean
  readonly phase: KcSendPhase
}

/**
 * The dogs a sending would send as they are: new and changed results, and the unchanged ones when forced.
 * A dog Kennelliitto knows by another number waits for the secretary's choice (`dogsToDecide`).
 */
export const dogsToSend = (preview: KcPreviewResponse, force: boolean): KcDogReport[] =>
  preview.dogs.filter(
    (dog) => !dog.kcDog && (dog.status === 'ready' || dog.status === 'changed' || (force && dog.status === 'unchanged'))
  )

/** The dogs Kennelliitto knows by another number, whose results go only after the secretary's choice (KOE-1653). */
export const dogsToDecide = (preview: KcPreviewResponse): KcDogReport[] =>
  preview.dogs.filter((dog) => dog.kcDog && dog.status === 'ready')

/** The dogs whose result cannot be sent, with the problems that say why; a sending never asks for them. */
export const dogsBlocked = (preview: KcPreviewResponse): KcDogReport[] =>
  preview.dogs.filter((dog) => dog.status === 'blocked')

/** Whether the preview has anything to send, as it is or after the choices. */
const hasAnythingToSend = (preview: KcPreviewResponse, force: boolean) =>
  !preview.blockers.length && (dogsToSend(preview, force).length > 0 || dogsToDecide(preview).length > 0)

const Preview = ({
  force,
  onForce,
  preview,
}: Pick<Props, 'force' | 'onForce'> & { readonly preview: KcPreviewResponse }) => {
  const { t } = useTranslation()
  const count = (status: KcDogReport['status']) =>
    preview.dogs.filter((dog) => dog.status === status && !dog.kcDog).length
  const toDecide = dogsToDecide(preview).length

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

  const blocked = dogsBlocked(preview)
  const creates = preview.dogs.filter((dog) => dog.createsDog && !dog.kcDog)
  const summary = (['ready', 'changed', 'unchanged', 'notRecorded', 'blocked'] as const).filter((status) =>
    count(status)
  )

  return (
    <Stack spacing={2}>
      <Typography>{t('results.kennelliitto.confirm')}</Typography>
      <Alert severity="info">{t('results.kennelliitto.confirmNote')}</Alert>
      <Stack spacing={0.25}>
        {summary.map((status) => (
          <Typography key={status} variant="body2">
            {t(`results.kennelliitto.summary.${status}`, { count: count(status) })}
          </Typography>
        ))}
        {toDecide > 0 && (
          <Typography variant="body2">{t('results.kennelliitto.summary.kcRegNo', { count: toDecide })}</Typography>
        )}
        {!summary.length && !toDecide && (
          <Typography variant="body2">{t('results.kennelliitto.nothingToSend')}</Typography>
        )}
      </Stack>
      {creates.length > 0 && (
        <Alert severity="info">
          <Typography sx={{ fontWeight: 600 }} variant="body2">
            {t('results.kennelliitto.createsDogs')}
          </Typography>
          <KennelliittoDogList lines={creates.map(createsDogLine)} />
        </Alert>
      )}
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

/**
 * What came of a sending. The failed list holds Kennelliitto's refusals and then the dogs the preview said
 * cannot be sent, so it names every dog whose result did not get there (KOE-1656).
 */
const Report = ({ blocked, summary }: { readonly blocked: KcDogReport[]; readonly summary: KcSendSummary }) => {
  const { t } = useTranslation()
  const sent = summary.reports.filter((report) => report.outcome === 'sent')
  const failed = summary.reports.filter((report) => report.outcome === 'failed')
  const skipped = summary.reports.filter((report) => report.outcome === 'skipped')
  const failedLines = [...failed.map((report) => failedLine(t, report)), ...blocked.map((dog) => dogLine(t, dog))]

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
          <KennelliittoDogList lines={sent.map((report) => ({ id: report.id, text: dogLabel(report) }))} />
        </Alert>
      )}
      {failedLines.length > 0 && (
        <Alert severity="error">
          <Typography sx={{ fontWeight: 600 }} variant="body2">
            {t('results.kennelliitto.failure', { count: failedLines.length })}
          </Typography>
          <KennelliittoDogList lines={failedLines} />
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
const canSendIn = (phase: KcSendPhase, force: boolean, decisions: KcRegNoDecisions): boolean => {
  if (phase.kind === 'preview') return hasAnythingToSend(phase.preview, force)
  return phase.kind === 'regNos' && isEveryRegNoDecided(phase.rows, decisions)
}

export const KennelliittoSendDialog = ({
  decisions,
  force,
  onBack,
  onClose,
  onDecide,
  onForce,
  onSend,
  open,
  phase,
}: Props) => {
  const { t } = useTranslation()
  const canSend = canSendIn(phase, force, decisions)
  const choosing = phase.kind === 'regNos'

  return (
    <Dialog fullWidth maxWidth="sm" onClose={onClose} open={open}>
      <DialogTitle>{t('results.kennelliitto.title')}</DialogTitle>
      <DialogContent>
        {phase.kind === 'loading' && <Typography>{t('results.kennelliitto.loading')}</Typography>}
        {phase.kind === 'failed' && (
          <Alert severity="error">{t('results.kennelliitto.statusUnknown', { status: 0 })}</Alert>
        )}
        {phase.kind === 'preview' && <Preview force={force} onForce={onForce} preview={phase.preview} />}
        {choosing && <KennelliittoRegNoChoices decisions={decisions} onChange={onDecide} rows={phase.rows} />}
        {phase.kind === 'sending' && (
          <Stack spacing={1}>
            <Typography>{t('results.kennelliitto.sending', { done: phase.done, total: phase.total })}</Typography>
            <LinearProgress value={phase.total ? (phase.done * 100) / phase.total : 0} variant="determinate" />
          </Stack>
        )}
        {phase.kind === 'report' && <Report blocked={phase.blocked} summary={phase.summary} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('results.kennelliitto.close')}</Button>
        {choosing && <Button onClick={onBack}>{t('results.kennelliitto.regNo.back')}</Button>}
        {(phase.kind === 'preview' || phase.kind === 'loading' || choosing) && (
          <Button disabled={!canSend} onClick={onSend} variant="contained">
            {t(choosing ? 'results.kennelliitto.regNo.confirm' : 'results.kennelliitto.send')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
