import type { KcPreviewResponse } from '@/lib/kennelliittoResults'
import type { ConfirmedEvent, Registration } from '@/types'
import type { KcHandOverOutcome } from '../../state/registrations/actions'
import type { KcRegNoDecision, KcRegNoDecisions, KcRegNoRow } from './KennelliittoRegNoChoices'
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
import { getEventProgress, uniqueClasses } from '@/lib/event'
import { countSentResults, defaultKcRegNoChoice, isResultsLocked } from '@/lib/kennelliittoResults'
import { getRegistrationClass, inRegistrationOrder, isScorableRegistration } from '@/lib/registration'
import { KcIdLookupButton } from '../../components/KcIdLookupButton'
import { useSaveKcLink } from '../../hooks/useSaveKcLink'
import { useKennelliittoResults } from '../../state/registrations/actions'
import { KennelliittoHandOverDialog } from './KennelliittoHandOverDialog'
import { dogsBlocked, dogsToDecide, dogsToSend, KennelliittoSendDialog } from './KennelliittoSendDialog'
import { PublishingSection } from './PublishingSection'
import { actionButtonSx } from './styles'

interface Props {
  readonly event: ConfirmedEvent
  /**
   * Reads Kennelliitto's state again. The event view reads it as soon as the trial shows locked, panel
   * open or not, since the step indicator shows the lock too; this is the same read on request.
   */
  readonly onRefreshState: () => Promise<unknown>
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
    sent: countSentResults(rows),
    total: rows.length,
  }))
}

/** The dogs to decide about, each beside the entry's own dog as this page holds it (KOE-1653). */
const regNoRowsOf = (preview: KcPreviewResponse, registrations: Registration[]): KcRegNoRow[] =>
  dogsToDecide(preview).flatMap((report) => {
    if (!report.kcDog) return []
    const dog = registrations.find((registration) => registration.id === report.id)?.dog
    return [{ dog: dog ?? { name: report.name, regNo: report.regNo }, kcDog: report.kcDog, report }]
  })

const defaultDecisions = (rows: KcRegNoRow[]): KcRegNoDecisions =>
  Object.fromEntries(rows.map((row) => [row.report.id, defaultKcRegNoChoice(row.dog, row.kcDog)]))

/**
 * What a confirmed choice sends: the dogs as they are, and the dogs whose number is changed to Kennelliitto's,
 * all in the preview's order, which is the start list's (KOE-1652).
 */
const sendingOf = (preview: KcPreviewResponse, force: boolean, rows: KcRegNoRow[], decisions: KcRegNoDecisions) => {
  const switchRegNos = rows.filter((row) => decisions[row.report.id] === 'switch').map((row) => row.report.id)
  const sent = new Set([...dogsToSend(preview, force).map((dog) => dog.id), ...switchRegNos])
  return { ids: preview.dogs.filter((dog) => sent.has(dog.id)).map((dog) => dog.id), switchRegNos }
}

/**
 * The hand-over's answer with its dogs in the order of the secretary's start list (KOE-1652), as the
 * sending's answers are; the server lists them in the order it read them.
 */
const handOverInRegistrationOrder = (
  outcome: Exclude<KcHandOverOutcome, { kind: 'done' }>,
  registrations: Registration[]
): Exclude<KcHandOverOutcome, { kind: 'done' }> =>
  outcome.kind === 'confirmationNeeded' || outcome.kind === 'unsent'
    ? { ...outcome, dogs: inRegistrationOrder(outcome.dogs, registrations) }
    : outcome

/**
 * Sending the results to Kennelliitto's Omakoira and handing the trial to the chief judge, as a step of
 * its own in the event management (KOE-1579). It was a secondary button at the foot of the results
 * entry, out of sight of the steps a trial goes through.
 *
 * The whole trial is sent at once: a sending only ever takes the new and changed results, and a dog that
 * cannot go does not hold the others back. Handing over is what finishes the step; until the chief judge
 * sends the trial back, the results are locked here and on the results page alike.
 */
const KennelliittoSubmission = ({ event, onRefreshState, registrations }: Props) => {
  const { t } = useTranslation()
  const kc = useKennelliittoResults(event.id)
  const saveKcLink = useSaveKcLink(event)
  const locked = isResultsLocked(event)
  const [sendOpen, setSendOpen] = useState(false)
  const [sendPhase, setSendPhase] = useState<KcSendPhase>({ kind: 'loading' })
  const [forceSend, setForceSend] = useState(false)
  const [regNoDecisions, setRegNoDecisions] = useState<KcRegNoDecisions>({})
  const [handOverOpen, setHandOverOpen] = useState(false)
  const [handOverOutcome, setHandOverOutcome] = useState<Exclude<KcHandOverOutcome, { kind: 'done' }>>()
  const [handOverAccepted, setHandOverAccepted] = useState(false)

  const rows = useMemo(() => getSentRows(event, registrations), [event, registrations])
  // Every sent result, not only the rows': the hand-over is offered whenever anything is in Omakoira.
  const sentCount = useMemo(() => countSentResults(registrations), [registrations])
  // The step's own rule, so the button and the step indicator never disagree on whether to send now.
  const { kennelliittoActionable } = getEventProgress(event, new Date(), { handedOver: locked })

  const openSend = useCallback(async () => {
    setForceSend(false)
    setSendPhase({ kind: 'loading' })
    setSendOpen(true)
    try {
      // Every list of dogs the dialogs show is in the order of the secretary's start list (KOE-1652).
      const preview = await kc.preview()
      setSendPhase({ kind: 'preview', preview: { ...preview, dogs: inRegistrationOrder(preview.dogs, registrations) } })
    } catch (error) {
      reportError(error)
      setSendPhase({ kind: 'failed' })
    }
  }, [kc, registrations])

  const handleSend = useCallback(async () => {
    if (sendPhase.kind !== 'preview' && sendPhase.kind !== 'regNos') return
    const rows = regNoRowsOf(sendPhase.preview, registrations)
    // Dogs Kennelliitto knows by another number are decided about first, all in one view (KOE-1653).
    if (sendPhase.kind === 'preview' && rows.length) {
      setRegNoDecisions(defaultDecisions(rows))
      setSendPhase({ kind: 'regNos', preview: sendPhase.preview, rows })
      return
    }
    const { ids, switchRegNos } = sendingOf(sendPhase.preview, forceSend, rows, regNoDecisions)
    // Never asked for, so the server says nothing of them: the report lists them from the preview (KOE-1656).
    const blocked = dogsBlocked(sendPhase.preview)
    const onProgress = (done: number) => setSendPhase({ done, kind: 'sending', total: ids.length })
    setSendPhase({ done: 0, kind: 'sending', total: ids.length })
    const summary = await kc.send(ids, { force: forceSend, switchRegNos }, onProgress)
    // The answers of every request and retry, put back in the list's order (KOE-1652).
    setSendPhase({
      blocked,
      kind: 'report',
      summary: { ...summary, reports: inRegistrationOrder(summary.reports, registrations) },
    })
  }, [forceSend, kc, registrations, regNoDecisions, sendPhase])

  const decideRegNo = useCallback((id: string, decision: KcRegNoDecision) => {
    setRegNoDecisions((decisions) => ({ ...decisions, [id]: decision }))
  }, [])

  const backToPreview = useCallback(() => {
    if (sendPhase.kind === 'regNos') setSendPhase({ kind: 'preview', preview: sendPhase.preview })
  }, [sendPhase])

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
    setHandOverOutcome(handOverInRegistrationOrder(outcome, registrations))
  }, [handOverAccepted, kc, registrations, t])

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
                    onClick={() => void onRefreshState().catch(reportError)}
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
              disabled={!kennelliittoActionable}
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
        decisions={regNoDecisions}
        force={forceSend}
        onBack={backToPreview}
        onClose={() => setSendOpen(false)}
        onDecide={decideRegNo}
        onForce={setForceSend}
        onSend={() => void handleSend()}
        open={sendOpen}
        phase={sendPhase}
      />
      <KennelliittoHandOverDialog
        accepted={handOverAccepted}
        eventType={event.eventType}
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
