import type { Theme } from '@mui/material'
import type { EventResultsResponse, StoredEventResult } from '../../api/registration'
import type { DogEvent, EventResult, EventStation, Patch, PublicJudge } from '../../types'
import type { ResultEdit } from '../components/stationScoring/types'
import type { ConflictChoice, ResultConflict } from './eventResultsPage/ConflictDialog'
import type { KcSendPhase, KcSendScope } from './eventResultsPage/KennelliittoSendDialog'
import type { KcHandOverOutcome } from './state/registrations/actions'
import Save from '@mui/icons-material/Save'
import { useMediaQuery } from '@mui/material'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { APIError } from '../../api/http'
import { useEventSubscription } from '../../hooks/useEventSubscription'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'
import { reportError } from '../../lib/client/error'
import { errorSnackbarOptions } from '../../lib/client/snackbar'
import { isOfficialEventType, localizedEventName } from '../../lib/event'
import { liveViewEnabled } from '../../lib/features'
import { makeArray } from '../../lib/judge'
import { canSendResultsOfEventType, isResultsLocked } from '../../lib/kennelliittoResults'
import { IMPLICIT_STATION_ID, liveFormat } from '../../lib/liveFormat'
import {
  getRegistrationClass,
  isScorableRegistration,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../lib/registration'
import { classRound, scoresAtPosts, stationVersion } from '../../lib/results'
import { Path } from '../../routeConfig'
import { AsyncButton } from '../components/AsyncButton'
import { emptyEdit } from '../components/stationScoring/types'
import { idTokenAtom, languageAtom } from '../state'
import { EntryPageHeader } from './components/EntryPageHeader'
import EventNotFound from './components/EventNotFound'
import { KcIdLookupButton } from './components/KcIdLookupButton'
import { StartDaySelector } from './components/StartDaySelector'
import { useStartDayClasses } from './components/useStartDayClasses'
import { ConflictDialog } from './eventResultsPage/ConflictDialog'
import { KennelliittoHandOverDialog } from './eventResultsPage/KennelliittoHandOverDialog'
import { dogsToSend, KennelliittoSendDialog } from './eventResultsPage/KennelliittoSendDialog'
import ResultsTable from './eventResultsPage/ResultsTable'
import { useReadStateWhileLocked } from './hooks/useReadStateWhileLocked'
import { adminConfirmedEventAtom, adminEventRegistrationsAtom, useAdminEventActions } from './state'
import { useAdminEventScope } from './state/eventScope'
import { useKennelliittoResults, useSaveEventResults, useStoreEventResults } from './state/registrations/actions'

/** The whole round, or one post's slice of it. */
const WHOLE_ROUND = 'all'

/** A 409 carries the disputed dogs, and beside them whatever did get written. */
interface ResultConflictBody {
  conflicts: ResultConflict[]
  saved?: EventResultsResponse['saved']
  unchanged?: EventResultsResponse['unchanged']
}

/** The dogs a refused batch had written before it was refused, as the 423 body carries them. */
const savedOf = (body: unknown): StoredEventResult[] => {
  if (typeof body !== 'object' || body === null) return []
  const saved = 'saved' in body && Array.isArray(body.saved) ? body.saved : []
  const unchanged = 'unchanged' in body && Array.isArray(body.unchanged) ? body.unchanged : []
  return [...saved, ...unchanged]
}

const isResultConflictBody = (body: unknown): body is ResultConflictBody =>
  typeof body === 'object' && body !== null && Array.isArray((body as { conflicts?: unknown }).conflicts)

export default function EventResultsPage() {
  const { t } = useTranslation()
  const { id: eventId = '' } = useParams()
  useAdminEventScope(eventId)
  const _token = useAtomValue(idTokenAtom)
  const event = useAtomValue(adminConfirmedEventAtom(eventId))
  const language = useAtomValue(languageAtom)
  const registrations = useAtomValue(adminEventRegistrationsAtom(eventId))
  const saveResults = useSaveEventResults(eventId)
  const storeResults = useStoreEventResults(eventId)
  const kc = useKennelliittoResults(eventId)
  // What another secretary — or the post's own link — saves arrives over the socket only while this
  // page is subscribed to the event.
  useEventSubscription(eventId)
  // A whole NOWT round is a thousand pixels of columns; short of that the dogs go one under another (KOE-1280).
  const compact = useMediaQuery((theme: Theme) => theme.breakpoints.down('md'))

  const scorable = useMemo(() => registrations.filter(isScorableRegistration), [registrations])
  const [scope, setScope] = useState<string>(WHOLE_ROUND)
  const [edits, setEdits] = useState<Record<string, ResultEdit>>({})
  const [defaultJudges, setDefaultJudges] = useState<Record<string, PublicJudge | undefined>>({})
  const [conflicts, setConflicts] = useState<ResultConflict[]>([])
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({})
  const [sendOpen, setSendOpen] = useState(false)
  const [sendPhase, setSendPhase] = useState<KcSendPhase>({ kind: 'loading' })
  const [sendScope, setSendScope] = useState<KcSendScope>('class')
  const [forceSend, setForceSend] = useState(false)
  const [handOverOpen, setHandOverOpen] = useState(false)
  const [handOverOutcome, setHandOverOutcome] = useState<Exclude<KcHandOverOutcome, { kind: 'done' }>>()
  const [handOverAccepted, setHandOverAccepted] = useState(false)
  // A whole round's scores can ride on these edits; one stray swipe must not discard them (KOE-1283).
  useUnsavedChangesWarning(Object.keys(edits).length > 0)

  const stations: EventStation[] = useMemo(
    () => (scoresAtPosts(event?.eventType) ? (event?.stations ?? []) : []),
    [event?.eventType, event?.stations]
  )

  // A multi-day trial is scored one day at a time, the same way its numbers are drawn (KOE-1353).
  const { classes, day, dayRegistrations, days, eventClass, setSelectedClass, setSelectedDay } =
    useStartDayClasses(scorable)

  // The dogs of the class being scored, and — for the conflict dialog — every dog of it: edits
  // survive a day switch, so a disputed dog may no longer be on screen when the answer comes back.
  const classRegistrations = useMemo(
    () =>
      scorable
        .filter((reg) => getRegistrationClass(reg) === eventClass)
        .sort(sortRegistrationsByDateClassTimeAndNumber),
    [eventClass, scorable]
  )

  const rows = useMemo(
    () =>
      dayRegistrations
        .filter((reg) => getRegistrationClass(reg) === eventClass)
        .sort(sortRegistrationsByDateClassTimeAndNumber),
    [dayRegistrations, eventClass]
  )

  const fullRound = useMemo(() => {
    const classStations = event?.classes?.find((item) => item.class === eventClass)?.stations
    return classRound(stations, classStations)
  }, [event?.classes, eventClass, stations])

  // A post's own view narrows the columns; the prize is withheld there, because it depends on posts
  // this view cannot see and a partial figure would read as a verdict.
  const scoped = scope !== WHOLE_ROUND
  // A format that runs its day at one post has no scope to pick, but that one post has its own view
  // all the same: the live clock and the queue are what the day is run from (KOE-1259).
  const singlePost = liveFormat(event?.eventType).posts === 'one'
  const stationViewId = scoped ? scope : IMPLICIT_STATION_ID
  const round = useMemo(
    () => (scoped ? fullRound.filter((task) => task.stationId === scope) : fullRound),
    [fullRound, scope, scoped]
  )

  // A post names its own judges; where it names none, the class's judge stands for it.
  const classJudges = useMemo(
    () => makeArray(event?.classes?.find((item) => item.class === eventClass)?.judge),
    [event?.classes, eventClass]
  )
  // A classless type has no class to hang judges on, so the event's own judges stand for the round.
  const eventJudges = useMemo(
    () =>
      (classJudges.length ? classJudges : (event?.judges ?? [])).filter((judge): judge is PublicJudge =>
        Boolean(judge?.id)
      ),
    [classJudges, event?.judges]
  )

  const judgesFor = useCallback(
    (id: string) => {
      const own = stations.find((station) => station.id === id)?.judges ?? []
      return (own.length ? own : classJudges).filter((judge): judge is PublicJudge => Boolean(judge?.id))
    },
    [classJudges, stations]
  )

  // KOE-452: entering results is often when anyone first notices the Kennelliitto id is missing, and
  // it is needed before the results can go anywhere. Offering the lookup here saves a trip back to the
  // event form to fetch something the secretary is already standing in front of.
  const eventActions = useAdminEventActions()
  const saveKcId = useCallback(
    async (patch: Patch<DogEvent>) => {
      if (event) await eventActions.save({ ...event, ...patch })
    },
    [event, eventActions]
  )

  // Results handed to the chief judge are out of the secretary's hands until the judge sends them back.
  const locked = event ? isResultsLocked(event) : false
  const kennelliitto = !!event && isOfficialEventType(event.eventType) && canSendResultsOfEventType(event.eventType)
  const sentCount = useMemo(
    () => registrations.filter((registration) => registration.kcResult?.status === 'sent').length,
    [registrations]
  )

  // The state Kennelliitto reports is what locks, so a locked page reads it afresh: a judge who has sent the
  // trial back opens it again without anyone having to do anything here.
  const refreshState = useCallback(async () => {
    try {
      await kc.preview([])
    } catch (error) {
      reportError(error)
    }
  }, [kc])
  useReadStateWhileLocked(locked, refreshState)

  const loadPreview = useCallback(
    async (scope: KcSendScope) => {
      setSendPhase({ kind: 'loading' })
      try {
        const ids = scope === 'class' ? classRegistrations.map((registration) => registration.id) : undefined
        setSendPhase({ kind: 'preview', preview: await kc.preview(ids) })
      } catch (error) {
        reportError(error)
        setSendPhase({ kind: 'failed' })
      }
    },
    [classRegistrations, kc]
  )

  const openSend = useCallback(() => {
    setForceSend(false)
    setSendOpen(true)
    void loadPreview(sendScope)
  }, [loadPreview, sendScope])

  const changeSendScope = useCallback(
    (scope: KcSendScope) => {
      setSendScope(scope)
      void loadPreview(scope)
    },
    [loadPreview]
  )

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

  const handleChange = useCallback(
    (registrationId: string, edit: ResultEdit | undefined) =>
      setEdits((prev) => {
        if (edit) return { ...prev, [registrationId]: edit }
        const { [registrationId]: _clean, ...rest } = prev
        return rest
      }),
    []
  )

  const submissionFor = useCallback(
    (id: string, edit: ResultEdit, overrideBase?: EventResult) => {
      const stored = overrideBase ?? registrations.find((reg) => reg.id === id)?.eventResult

      return {
        // The version this edit was made against, so the server can tell a second writer from a retry.
        basedOn: scoped ? stationVersion(stored?.tasks, scope) : stored?.updatedAt,
        eventResult: {
          elimination: edit.elimination,
          ...(edit.judge ? { judge: edit.judge } : {}),
          ...(edit.resultCode ? { resultCode: edit.resultCode } : {}),
          retirement: edit.retirement,
          tasks: edit.tasks,
        },
        id,
        ...(scoped ? { stationId: scope } : {}),
      }
    },
    [registrations, scope, scoped]
  )

  const report = useCallback(
    (savedCount: number) =>
      // Nothing saved and nothing disputed means it was all already stored — the answer a retry over a
      // bad connection gets, and worth saying plainly rather than implying a write happened.
      enqueueSnackbar(savedCount ? t('results.saved') : t('results.alreadySaved'), { variant: 'success' }),
    [t]
  )

  // The list as the server has it: edits of dogs that are no longer on the sheet are dropped, the rest stay.
  const dropGoneDogs = useCallback(async () => {
    const fresh = await kc.reload()
    const present = new Set(fresh.filter(isScorableRegistration).map((registration) => registration.id))
    setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => present.has(id))))
  }, [kc])

  const handleSave = useCallback(async () => {
    const submissions = Object.entries(edits).map(([id, edit]) => submissionFor(id, edit))
    if (submissions.length === 0) return

    try {
      // Stored is stored: the action folds what came back into the rows, so the result stays on screen.
      const response = await saveResults(submissions)
      report(response.saved.length)
      setEdits({})
    } catch (error) {
      // A conflict arrives as a rejected 409 rather than a value, and its body carries both versions.
      if (error instanceof APIError && error.status === 423) {
        // Handed to the judge from somewhere else, perhaps part way through the batch: the dogs saved before
        // that are stored, so they are folded in and taken off the screen like the saved dogs of a conflict.
        const done = savedOf(error.body)
        await storeResults(done)
        setEdits((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([id]) => !done.some((item) => item.id === id)))
        )
        enqueueSnackbar(t('results.kennelliitto.lockedSave'), errorSnackbarOptions)
        await refreshState()
        return
      }
      if (error instanceof APIError && (error.status === 404 || error.status === 422)) {
        // A dog the batch named is not on the trial any more (the list was old): nothing was written. The list
        // is read again and the dogs that are gone leave the screen, so the others can be saved.
        reportError(error)
        enqueueSnackbar(t('results.saveFailed'), errorSnackbarOptions)
        await dropGoneDogs().catch(reportError)
        return
      }
      const body = error instanceof APIError && error.status === 409 ? error.body : undefined
      if (!isResultConflictBody(body)) {
        // Anything else — the server refusing a dog that did not run, a dropped connection — keeps the
        // entered scores on screen and says so. The button only stops spinning, which reads as success.
        reportError(error)
        enqueueSnackbar(t('results.saveFailed'), errorSnackbarOptions)
        return
      }

      // Whatever did not conflict is already written; keep only the disputed dogs on screen.
      await storeResults([...(body.saved ?? []), ...(body.unchanged ?? [])])
      setEdits((prev) => Object.fromEntries(body.conflicts.map(({ id }) => [id, prev[id] ?? emptyEdit])))
      setConflicts(body.conflicts)
      setChoices({})
    }
  }, [dropGoneDogs, edits, refreshState, report, saveResults, storeResults, submissionFor, t])

  const handleResolve = useCallback(async () => {
    // Only the dogs the secretary decided to overrule are sent again, each based on the version that
    // beat it, so this save is no longer a conflict.
    const mine = conflicts.filter((conflict) => choices[conflict.id] === 'mine')
    const submissions = mine.map((conflict) =>
      submissionFor(conflict.id, edits[conflict.id] ?? emptyEdit, conflict.stored)
    )

    if (submissions.length) {
      const response = await saveResults(submissions)
      report(response.saved.length)
    }

    setConflicts([])
    setChoices({})
    setEdits({})
  }, [choices, conflicts, edits, report, saveResults, submissionFor])

  if (!event?.id) return <EventNotFound />

  const name = localizedEventName(event, language)

  return (
    <Paper
      elevation={2}
      sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100%', maxWidth: '100%' }}
    >
      <EntryPageHeader eventId={eventId} title={t('results.title')}>
        {/* Which trial these results belong to, so the secretary is never entering against the wrong
            event: the day, the format, the venue and the name, same order as the AC gives them. */}
        <Typography variant="body2">
          {t('dateFormat.datespan', { end: event.endDate, start: event.startDate })} {event.eventType} {event.location}
          {name ? ` (${name})` : ''}
        </Typography>
        {event.kcGuid ? (
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
            }}
          >
            {t('event.kcGuidLinked')}
          </Typography>
        ) : (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
            }}
          >
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
              }}
            >
              {event.kcId ? t('event.kcIdLegacy', { id: event.kcId }) : t('event.kcIdEmpty')}
            </Typography>
            <KcIdLookupButton event={event} onChange={saveKcId} variant="text" />
          </Stack>
        )}
      </EntryPageHeader>

      {locked && (
        <Alert
          action={
            <Button color="inherit" onClick={() => void refreshState()} size="small" sx={{ whiteSpace: 'nowrap' }}>
              {t('results.kennelliitto.refreshState')}
            </Button>
          }
          severity="warning"
          sx={{ mt: 1, mx: { md: 2, xs: 1 } }}
        >
          {t('results.kennelliitto.locked')}
        </Alert>
      )}
      {!locked && kennelliitto && sentCount > 0 && (
        <Alert
          action={
            <Button color="inherit" onClick={openHandOver} size="small" sx={{ whiteSpace: 'nowrap' }}>
              {t('results.kennelliitto.handOverButton')}
            </Button>
          }
          severity="info"
          sx={{ mt: 1, mx: { md: 2, xs: 1 } }}
        >
          {t('results.kennelliitto.sentNotHandedOver', { count: sentCount })}
        </Alert>
      )}

      <StartDaySelector days={days} onChange={setSelectedDay} value={day} />

      <Stack
        direction="row"
        useFlexGap
        sx={{
          alignItems: 'center',
          columnGap: 2,
          flexWrap: 'wrap',
          pt: 1,
          px: { md: 2, xs: 1 },
          rowGap: 1,
        }}
      >
        <Tabs onChange={(_event, value) => setSelectedClass(value)} value={eventClass ?? false}>
          {classes.map((item) => (
            <Tab key={item} label={item} value={item} />
          ))}
        </Tabs>
        {liveViewEnabled && (scoped || singlePost) && (
          <Button
            component={Link}
            size="small"
            to={Path.admin.stationResults(eventId, stationViewId)}
            variant="outlined"
          >
            {t('results.openLiveEntry')}
          </Button>
        )}
        {stations.length > 0 && (
          <TextField
            label={t('results.scope')}
            onChange={(e) => setScope(e.target.value)}
            select
            size="small"
            sx={{ minWidth: 180 }}
            value={scope}
          >
            <MenuItem value={WHOLE_ROUND}>{t('results.scopeAll')}</MenuItem>
            {stations.map((station) => (
              <MenuItem key={station.id} value={station.id}>
                {t('event.station')} {station.number}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>

      {/* With every control greyed out nothing inside can take focus, and a scrolling region must be reachable by keyboard. */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: { md: 2, xs: 1 } }} tabIndex={locked ? 0 : undefined}>
        <ResultsTable
          compact={compact}
          disabled={locked}
          edits={edits}
          eventClass={eventClass}
          eventType={event.eventType}
          fullRound={scoped ? undefined : fullRound}
          onChange={handleChange}
          defaultJudges={defaultJudges}
          judges={eventJudges}
          judgesFor={judgesFor}
          kennelliitto={kennelliitto}
          onJudgeChange={(id, judge) => setDefaultJudges((prev) => ({ ...prev, [id]: judge }))}
          registrations={rows}
          round={round}
          stationId={scoped ? scope : undefined}
          stations={stations}
        />
      </Box>

      <Stack
        direction="row"
        spacing={1}
        sx={{
          borderColor: '#bdbdbd',
          borderTop: '1px solid',
          justifyContent: 'flex-end',
          p: 1,
        }}
      >
        {kennelliitto && (
          <Stack direction="row" spacing={1} sx={{ flexGrow: 1 }}>
            <Button disabled={locked} onClick={openSend} variant="outlined">
              {t('results.kennelliitto.send')}
            </Button>
            {sentCount > 0 && !locked && (
              <Button onClick={openHandOver} variant="outlined">
                {t('results.kennelliitto.handOverButton')}
              </Button>
            )}
          </Stack>
        )}
        <Button disabled={Object.keys(edits).length === 0} onClick={() => setEdits({})}>
          {t('cancel')}
        </Button>
        <AsyncButton
          color="primary"
          disabled={locked || Object.keys(edits).length === 0}
          onClick={handleSave}
          startIcon={<Save />}
          variant="contained"
        >
          {t('results.save')}
        </AsyncButton>
      </Stack>

      <KennelliittoSendDialog
        eventClass={eventClass}
        force={forceSend}
        onClose={() => setSendOpen(false)}
        onForce={setForceSend}
        onScope={changeSendScope}
        onSend={() => void handleSend()}
        open={sendOpen}
        phase={sendPhase}
        scope={sendScope}
      />
      <KennelliittoHandOverDialog
        accepted={handOverAccepted}
        onAccept={setHandOverAccepted}
        onClose={() => setHandOverOpen(false)}
        onHandOver={() => void handleHandOver()}
        open={handOverOpen}
        outcome={handOverOutcome}
      />

      <ConflictDialog
        choices={choices}
        conflicts={conflicts}
        onChoose={(id, choice) => setChoices((prev) => ({ ...prev, [id]: choice }))}
        onClose={() => setConflicts([])}
        onResolve={handleResolve}
        registrations={classRegistrations}
      />
    </Paper>
  )
}
