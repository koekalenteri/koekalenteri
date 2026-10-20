import type { ConfirmedEvent, Registration } from '@/types'
import type { KcHandOverOutcome } from '../../state/registrations/actions'
import type { KcSendPhase } from './KennelliittoSendDialog'
import AssignmentTurnedInOutlined from '@mui/icons-material/AssignmentTurnedInOutlined'
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { reportError } from '@/lib/client/error'
import { uniqueClasses } from '@/lib/event'
import { getRegistrationClass, isScorableRegistration } from '@/lib/registration'
import { KcIdLookupButton } from '../../components/KcIdLookupButton'
import { useSaveKcLink } from '../../hooks/useKcIdLookup'
import { useResultsLock } from '../../hooks/useReadStateWhileLocked'
import { useKennelliittoResults } from '../../state/registrations/actions'
import { KennelliittoHandOverDialog } from './KennelliittoHandOverDialog'
import { dogsToSend, KennelliittoSendDialog } from './KennelliittoSendDialog'
import { PublishingSection } from './PublishingSection'
import { actionButtonSx } from './styles'

interface Props {
  readonly event: ConfirmedEvent
  /** Nothing can be sent before there are results to enter. */
  readonly eventStarted?: boolean
  readonly registrations: Registration[]
}

interface SentRow {
  /** The class, or the event type for a classless event. */
  readonly name: string
  readonly sent: number
  readonly total: number
}

/** How many of each class's scored dogs have their result in Omakoira; a classless event is one row. */
const getSentRows = (event: ConfirmedEvent, registrations: Registration[]): SentRow[] => {
  const scorable = registrations.filter(isScorableRegistration)
  const classes = uniqueClasses(event)
  const groups = classes.length
    ? classes.map((eventClass) => ({
        name: eventClass,
        rows: scorable.filter((registration) => getRegistrationClass(registration) === eventClass),
      }))
    : [{ name: event.eventType, rows: scorable }]
  return groups.map(({ name, rows }) => ({
    name,
    sent: rows.filter((registration) => registration.kcResult?.status === 'sent').length,
    total: rows.length,
  }))
}

/**
 * Sending the results to Kennelliitto's Omakoira and handing the trial to the chief judge, as a step of
 * its own in the event management (KOE-1579). It was a secondary button at the foot of the results
 * entry, out of sight of the steps a trial goes through.
 *
 * The whole trial is sent at once: a sending only ever takes the new and changed results, and a dog that
 * cannot go does not hold the others back. Handing over is what finishes the step; until the chief judge
 * sends the trial back, the results are locked here and on the results page alike.
 */
const KennelliittoSubmission = ({ event, eventStarted, registrations }: Props) => {
  const { t } = useTranslation()
  const kc = useKennelliittoResults(event.id)
  const saveKcLink = useSaveKcLink(event)
  const { locked, refreshState } = useResultsLock(event, kc.preview)
  const [sendOpen, setSendOpen] = useState(false)
  const [sendPhase, setSendPhase] = useState<KcSendPhase>({ kind: 'loading' })
  const [forceSend, setForceSend] = useState(false)
  const [handOverOpen, setHandOverOpen] = useState(false)
  const [handOverOutcome, setHandOverOutcome] = useState<Exclude<KcHandOverOutcome, { kind: 'done' }>>()
  const [handOverAccepted, setHandOverAccepted] = useState(false)

  const rows = useMemo(() => getSentRows(event, registrations), [event, registrations])
  const sentCount = rows.reduce((sum, row) => sum + row.sent, 0)

  const openSend = useCallback(async () => {
    setForceSend(false)
    setSendPhase({ kind: 'loading' })
    setSendOpen(true)
    try {
      setSendPhase({ kind: 'preview', preview: await kc.preview() })
    } catch (error) {
      reportError(error)
      setSendPhase({ kind: 'failed' })
    }
  }, [kc])

  const handleSend = useCallback(async () => {
    if (sendPhase.kind !== 'preview') return
    const ids = dogsToSend(sendPhase.preview, forceSend).map((dog) => dog.id)
    setSendPhase({ done: 0, kind: 'sending', total: ids.length })
    const summary = await kc.send(ids, forceSend, (done) => setSendPhase({ done, kind: 'sending', total: ids.length }))
    setSendPhase({ kind: 'report', summary })
  }, [forceSend, kc, sendPhase])

  const openHandOver = useCallback(() => {
    setHandOverOutcome(undefined)
    setHandOverAccepted(false)
    setHandOverOpen(true)
  }, [])

  const handleHandOver = useCallback(async () => {
    const outcome = await kc.handOver(handOverAccepted)
    if (outcome.kind === 'done') {
      setHandOverOpen(false)
      enqueueSnackbar(t('results.kennelliitto.handOver.done'), { variant: 'success' })
      return
    }
    setHandOverOutcome(outcome)
  }, [handOverAccepted, kc, t])

  return (
    <>
      <PublishingSection
        title={t('results.kennelliitto.title')}
        action={
          <Stack spacing={1}>
            {/* Without a koetunnus every sending stops at the first check; the lookup is the way on. */}
            {!event.kcGuid && <KcIdLookupButton event={event} onChange={saveKcLink} variant="text" />}
            {locked && (
              <Alert
                action={
                  <Button
                    color="inherit"
                    onClick={() => void refreshState().catch(reportError)}
                    size="small"
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    {t('results.kennelliitto.refreshState')}
                  </Button>
                }
                severity="success"
              >
                {t('results.kennelliitto.blocker.handedOver')}
              </Alert>
            )}
            <Button
              disabled={!eventStarted || locked}
              fullWidth
              onClick={() => void openSend()}
              startIcon={<CloudUploadOutlined />}
              sx={actionButtonSx}
              variant="outlined"
            >
              {t('results.kennelliitto.send')}
            </Button>
            {sentCount > 0 && !locked && (
              <Button
                fullWidth
                onClick={openHandOver}
                startIcon={<AssignmentTurnedInOutlined />}
                sx={actionButtonSx}
                variant="outlined"
              >
                {t('results.kennelliitto.handOverButton')}
              </Button>
            )}
          </Stack>
        }
      >
        {rows.map(({ name, sent, total }) => (
          <TableRow key={name}>
            <TableCell align="left">
              <Box sx={{ ml: 2 }}>
                <Typography variant="caption" noWrap sx={{ fontWeight: 'bold' }}>
                  {name}
                </Typography>
              </Box>
            </TableCell>
            <TableCell align="right">
              <Typography variant="caption" noWrap sx={{ color: sent ? 'info.main' : 'text.secondary' }}>
                {t('results.kennelliitto.sentCount', { sent, total })}
              </Typography>
            </TableCell>
          </TableRow>
        ))}
      </PublishingSection>

      <KennelliittoSendDialog
        force={forceSend}
        onClose={() => setSendOpen(false)}
        onForce={setForceSend}
        onSend={() => void handleSend()}
        open={sendOpen}
        phase={sendPhase}
      />
      <KennelliittoHandOverDialog
        accepted={handOverAccepted}
        onAccept={setHandOverAccepted}
        onClose={() => setHandOverOpen(false)}
        onHandOver={() => void handleHandOver()}
        open={handOverOpen}
        outcome={handOverOutcome}
      />
    </>
  )
}

export default KennelliittoSubmission
