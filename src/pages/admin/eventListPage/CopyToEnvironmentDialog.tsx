import type { EventCopyResult } from '@/types'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormLabel from '@mui/material/FormLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APIError } from '@/api/http'

interface Props {
  readonly eventName: string
  readonly onClose: () => void
  readonly onCopy: (target: string) => Promise<EventCopyResult | undefined>
  readonly open: boolean
  readonly targets: readonly string[]
  /** For the screenshots of the states after a copy; the dialog reaches them itself. */
  readonly initialState?: CopyState
}

type CopyState =
  | { step: 'choose' }
  | { step: 'copying' }
  | { step: 'done'; result: EventCopyResult }
  | { step: 'failed'; message: string }

/** The server's own words where it gave some; the copy's refusals name what is wrong. */
const errorMessage = (error: unknown) => {
  if (error instanceof APIError) {
    const { body } = error
    if (typeof body === 'object' && body?.message) return body.message
    if (typeof body === 'string' && body) return body
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * Copies the selected event with its registrations into test or dev (KOE-1471). Every person in
 * the copy is replaced and its mail comes to the copier, which the dialog says before anything is
 * sent; afterwards it names the judges the target cannot use as they are.
 */
export default function CopyToEnvironmentDialog({
  eventName,
  initialState = { step: 'choose' },
  onClose,
  onCopy,
  open,
  targets,
}: Props) {
  const { t } = useTranslation()
  // Copies go to test or dev only; anything else is not offered by copyTargets
  const targetLabel = (option: string) => (option === 'dev' ? t('eventCopy.target.dev') : t('eventCopy.target.test'))
  const [target, setTarget] = useState(targets[0] ?? '')
  const [state, setState] = useState<CopyState>(initialState)

  const copy = useCallback(async () => {
    setState({ step: 'copying' })
    try {
      const result = await onCopy(target)
      setState(result ? { result, step: 'done' } : { step: 'choose' })
    } catch (error) {
      setState({ message: errorMessage(error), step: 'failed' })
    }
  }, [onCopy, target])

  const close = useCallback(() => {
    setState({ step: 'choose' })
    onClose()
  }, [onClose])

  const copying = state.step === 'copying'
  const done = state.step === 'done'

  return (
    <Dialog
      fullWidth
      maxWidth="sm"
      open={open}
      onClose={copying ? undefined : close}
      aria-labelledby="copy-to-environment-title"
    >
      <DialogTitle id="copy-to-environment-title">{t('eventCopy.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {eventName}
          </Typography>
          {done ? (
            <>
              <Alert severity="success">
                {state.result.target === 'dev' ? t('eventCopy.done.dev') : t('eventCopy.done.test')}
              </Alert>
              {state.result.judges.length > 0 && (
                <Alert severity="warning">
                  {t('eventCopy.judges')}
                  <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                    {state.result.judges.map((judge) => (
                      <li key={judge.name}>
                        {judge.name}: {t(`eventCopy.judgeReason.${judge.reason}`)}
                      </li>
                    ))}
                  </ul>
                </Alert>
              )}
            </>
          ) : (
            <>
              <FormControl disabled={copying}>
                <FormLabel id="copy-to-environment-target">{t('eventCopy.targetLabel')}</FormLabel>
                <RadioGroup
                  aria-labelledby="copy-to-environment-target"
                  row
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  {targets.map((option) => (
                    <FormControlLabel key={option} value={option} control={<Radio />} label={targetLabel(option)} />
                  ))}
                </RadioGroup>
              </FormControl>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>
                  <Typography variant="body2">{t('eventCopy.notes.people')}</Typography>
                </li>
                <li>
                  <Typography variant="body2">{t('eventCopy.notes.payments')}</Typography>
                </li>
                <li>
                  <Typography variant="body2">{t('eventCopy.notes.admin')}</Typography>
                </li>
              </ul>
              {state.step === 'failed' && (
                <Alert severity="error">{t('eventCopy.failed', { message: state.message })}</Alert>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {!done && (
          <Button
            onClick={copy}
            variant="contained"
            disabled={copying || !target}
            startIcon={copying ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {t('eventCopy.copy')}
          </Button>
        )}
        <Button onClick={close} variant="outlined" disabled={copying}>
          {t(done ? 'close' : 'cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
