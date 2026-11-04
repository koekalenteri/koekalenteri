import type { Theme } from '@mui/material'
import type {
  EventResult,
  EventResultConflict,
  EventResultsResponse,
  EventStation,
  PublicJudge,
  Registration,
  StoredEventResult,
} from '../../types'
import type { ConflictChoice } from '../components/stationScoring/ConflictDialog'
import type { ResultEdit } from '../components/stationScoring/types'
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
import { resultConflictResponse } from '../../lib/client/resultConflict'
import { errorSnackbarOptions } from '../../lib/client/snackbar'
import { liveViewEnabled } from '../../lib/features'
import { makeArray } from '../../lib/judge'
import { countSentResults, kcResultBadges } from '../../lib/kennelliittoResults'
import { IMPLICIT_STATION_ID, liveFormat, scoresAtPosts } from '../../lib/liveFormat'
import {
  getRegistrationClass,
  isScorableRegistration,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../lib/registration'
import { placementsFor } from '../../lib/results'
import { dogRound, editVersion, exercisePostsOf, exercisesAtPost, heldTasks, roundColumns } from '../../lib/resultTasks'
import { dayStations, rotationDogOf } from '../../lib/rotation'
import { Path } from '../../routeConfig'
import { AsyncButton } from '../components/AsyncButton'
import { ConflictDialog } from '../components/stationScoring/ConflictDialog'
import { emptyEdit } from '../components/stationScoring/types'
import { idTokenAtom } from '../state'
import { EntryPageHeader } from './components/EntryPageHeader'
import EventNotFound from './components/EventNotFound'
import { KcIdLookupButton } from './components/KcIdLookupButton'
import { StartDaySelector } from './components/StartDaySelector'
import { useStartDayClasses } from './components/useStartDayClasses'
import ResultsTable from './eventResultsPage/ResultsTable'
import { useIsOfficialEventType } from './hooks/useIsOfficialEventType'
import { useKennelliittoDogs } from './hooks/useKennelliittoDogs'
import { useResultsLock } from './hooks/useResultsLock'
import { useSaveKcLink } from './hooks/useSaveKcLink'
import { adminConfirmedEventAtom, adminEventRegistrationsAtom } from './state'
import { useAdminEventScope } from './state/eventScope'
import { useKennelliittoResults, useSaveEventResults, useStoreEventResults } from './state/registrations/actions'

/** The whole round, or one post's slice of it. */
const WHOLE_ROUND = 'all'

/** The dogs a refused batch had written before it was refused, as the 423 body carries them. */
const savedOf = (body: unknown): StoredEventResult[] => {
  if (typeof body !== 'object' || body === null) return []
  const saved = 'saved' in body && Array.isArray(body.saved) ? body.saved : []
  const unchanged = 'unchanged' in body && Array.isArray(body.unchanged) ? body.unchanged : []
  return [...saved, ...unchanged]
}

export default function EventResultsPage() {
  const { t } = useTranslation()
  const { id: eventId = '' } = useParams()
  useAdminEventScope(eventId)
  const _token = useAtomValue(idTokenAtom)
  const event = useAtomValue(adminConfirmedEventAtom(eventId))
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
  const [pickedScope, setPickedScope] = useState<string>(WHOLE_ROUND)
  const [edits, setEdits] = useState<Record<string, ResultEdit>>({})
  const [defaultJudges, setDefaultJudges] = useState<Record<string, PublicJudge | undefined>>({})
  const [conflicts, setConflicts] = useState<EventResultConflict[]>([])
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({})
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

  // The posts of the day on screen: a dog's round is made of its own day's posts (KOE-1665), so another
  // day's post is nothing to narrow to or to name as where a trial ended. A post picked on another day
  // gives way to the whole round.
  const dayPosts = useMemo(() => (day ? dayStations({ stations }, day) : stations), [day, stations])
  const scope = dayPosts.some((station) => station.id === pickedScope) ? pickedScope : WHOLE_ROUND

  // Ranked over every dog of the event, so a class's other day cannot leak into this one's ranks.
  const placements = useMemo(() => placementsFor(registrations), [registrations])

  // Each dog's round is its rotation group's (KOE-1665): the dogs of one class may differ when it splits
  // by start number, so the round is asked per dog, and the columns are what any of them has.
  const roundEvent = useMemo(
    () => ({ classes: event?.classes, rotations: event?.rotations, stations }),
    [event?.classes, event?.rotations, stations]
  )
  const fullRoundFor = useCallback(
    (registration: Registration) => dogRound(roundEvent, rotationDogOf(registration)),
    [roundEvent]
  )

  // A post's own view narrows the columns; the prize is withheld there, because it depends on posts
  // this view cannot see and a partial figure would read as a verdict.
  const scoped = scope !== WHOLE_ROUND
  // A format that runs its day at one post has no scope to pick, but that one post has its own view
  // all the same: the live clock and the queue are what the day is run from (KOE-1259).
  const singlePost = liveFormat(event?.eventType).posts === 'one'
  const stationViewId = scoped ? scope : IMPLICIT_STATION_ID
  const roundFor = useCallback(
    (registration: Registration) => {
      const full = fullRoundFor(registration)
      return scoped ? full.filter((task) => task.stationId === scope) : full
    },
    [fullRoundFor, scope, scoped]
  )
  // A post's own view lists the dogs whose group comes to it, as the post's link does.
  const tableRows = useMemo(
    () => (scoped ? rows.filter((registration) => roundFor(registration).length > 0) : rows),
    [roundFor, rows, scoped]
  )
  const round = useMemo(() => roundColumns(tableRows.map(roundFor)), [roundFor, tableRows])

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
  const saveKcId = useSaveKcLink(event)

  // Asked the way the event view's Omakoira section is, so the column and the section agree (KOE-1579).
  const official = useIsOfficialEventType(event?.eventType)
  // Results handed to the chief judge are out of the secretary's hands until the judge sends them back.
  // The state Kennelliitto reports is what locks, so an official trial's page reads it when it opens: a trial
  // handed over or confirmed in Omakoira directly locks here (KOE-1222), and one the judge sent back opens.
  // That read is the preview of every dog, which the Omakoira column shows, so the column says of each dog
  // what the send dialog says; it is read again when the dogs change, whoever changed them. Kennelliitto is
  // not asked about the foreign dogs here: the dialog does that when it opens.
  const { preview } = kc
  const previewAll = useCallback(() => preview(undefined, undefined, { withoutDogLookup: true }), [preview])
  const { dogs: kcDogs, refresh: refreshKcDogs } = useKennelliittoDogs(
    previewAll,
    registrations,
    event?.modifiedAt,
    official
  )
  const { locked, refreshState: readState } = useResultsLock(event, refreshKcDogs, { readOnOpen: official })
  const kennelliitto = useMemo(
    () => (event && official ? kcResultBadges(registrations, kcDogs) : undefined),
    [event, official, registrations, kcDogs]
  )
  const sentCount = useMemo(() => countSentResults(registrations), [registrations])

  const refreshState = useCallback(async () => {
    try {
      await readState()
    } catch (error) {
      reportError(error)
    }
  }, [readState])

  const handleChange = useCallback(
    (registrationId: string, edit: ResultEdit | undefined) =>
      setEdits((prev) => {
        if (edit) return { ...prev, [registrationId]: edit }
        const { [registrationId]: _clean, ...rest } = prev
        return rest
      }),
    []
  )

  // The exercises the dog's group does at the post on view, which are all a save there may write (KOE-1665).
  const exercisesHere = useCallback(
    (registration: Registration) => exercisesAtPost(exercisePostsOf(fullRoundFor(registration)), scope),
    [fullRoundFor, scope]
  )

  // The same, for a disputed dog the conflict dialog has only the id of.
  const exercisesOfDog = useCallback(
    (id: string) => {
      const registration = registrations.find((reg) => reg.id === id)
      return registration ? exercisesHere(registration) : []
    },
    [exercisesHere, registrations]
  )

  const submissionFor = useCallback(
    (id: string, edit: ResultEdit, overrideBase?: EventResult) => {
      const registration = registrations.find((reg) => reg.id === id)
      const stored = overrideBase ?? registration?.eventResult
      // A post's own view sends only its own exercises: the row holds the whole round, the other posts'
      // scores included. What that leaves out of a dog's edit stays behind (`settleEdits`).
      const here = scoped && registration ? exercisesHere(registration) : []
      const tasks = scoped ? edit.tasks.filter((task) => here.includes(task.exercise)) : edit.tasks

      return {
        // The version this edit was made against, so the server can tell a second writer from a retry.
        basedOn: editVersion(stored, scoped ? here : undefined),
        eventResult: {
          elimination: edit.elimination,
          ...(edit.judge ? { judge: edit.judge } : {}),
          ...(edit.resultCode ? { resultCode: edit.resultCode } : {}),
          retirement: edit.retirement,
          tasks,
        },
        id,
        ...(scoped ? { stationId: scope } : {}),
      }
    },
    [exercisesHere, registrations, scope, scoped]
  )

  /**
   * Takes the dogs whose save is settled off the screen, but for a score a post's save could not take
   * (KOE-1696): typed at another post, or at an exercise that has since moved, it stays in the edit for the
   * whole round to save, and the secretary is told. A disputed dog the secretary left as stored holds nothing:
   * its edit carries the version just turned down, which a later save would write back. Answers whether a
   * settled dog stayed.
   */
  const settleEdits = useCallback(
    (settled: (id: string) => boolean) => {
      const holdsScores = (id: string, edit: ResultEdit) => {
        const registration = registrations.find((reg) => reg.id === id)
        if (!scoped || !registration) return false
        if (conflicts.some((conflict) => conflict.id === id) && choices[id] !== 'mine') return false
        return heldTasks(edit.tasks, registration.eventResult?.tasks, exercisesHere(registration)).length > 0
      }
      const held = Object.entries(edits).some(([id, edit]) => settled(id) && holdsScores(id, edit))
      setEdits((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([id, edit]) => !settled(id) || holdsScores(id, edit)))
      )
      if (held) enqueueSnackbar(t('results.heldScores'), { variant: 'warning' })
      return held
    },
    [choices, conflicts, edits, exercisesHere, registrations, scoped, t]
  )

  // Every dog of the save is settled. Nothing saved and nothing disputed or held means it was all already stored,
  // the answer a retry over a bad connection gets, and worth saying plainly rather than implying a write happened.
  const finishSave = useCallback(
    (savedCount: number) => {
      const held = settleEdits(() => true)
      if (savedCount) enqueueSnackbar(t('results.saved'), { variant: 'success' })
      else if (!held) enqueueSnackbar(t('results.alreadySaved'), { variant: 'success' })
    },
    [settleEdits, t]
  )

  // The list as the server has it: edits of dogs that are no longer on the sheet are dropped, the rest stay.
  const dropGoneDogs = useCallback(async () => {
    const fresh = await kc.reload()
    const present = new Set(fresh.filter(isScorableRegistration).map((registration) => registration.id))
    setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => present.has(id))))
  }, [kc])

  // The batch was refused as locked: the dogs saved before the lock are stored, so they are folded in and settled
  // like the saved dogs of a conflict. The state is read whatever happens to the fold.
  const settleLockedBatch = useCallback(
    async (body: unknown) => {
      const done = savedOf(body)
      try {
        await storeResults(done)
        settleEdits((id) => done.some((item) => item.id === id))
      } catch (storeError) {
        // The state still has to be read, or the page stays open to a trial that is not.
        reportError(storeError)
      }
      enqueueSnackbar(t('results.kennelliitto.lockedSave'), errorSnackbarOptions)
      await refreshState()
    },
    [refreshState, settleEdits, storeResults, t]
  )

  // A dog the batch named is not on the trial any more (the list was old): nothing was written. The list is read
  // again and the dogs that are gone leave the screen, so the others can be saved.
  const settleGoneDogs = useCallback(
    async (error: APIError) => {
      reportError(error)
      enqueueSnackbar(t('results.saveFailed'), errorSnackbarOptions)
      await dropGoneDogs().catch(reportError)
    },
    [dropGoneDogs, t]
  )

  // Whatever did not conflict is already written and settled; the disputed dogs stay on screen.
  const settleConflict = useCallback(
    async (body: EventResultsResponse) => {
      await storeResults([...body.saved, ...body.unchanged])
      settleEdits((id) => !body.conflicts.some((conflict) => conflict.id === id))
      setEdits((prev) => ({
        ...prev,
        ...Object.fromEntries(body.conflicts.map(({ id }) => [id, prev[id] ?? emptyEdit])),
      }))
      setConflicts(body.conflicts)
      setChoices({})
    },
    [settleEdits, storeResults]
  )

  /**
   * Settles a save the server did not take, whether the save button's or the conflict dialog's: the same
   * refusal reads the same way from either (KOE-1488). It hands back the settling step itself rather than
   * awaiting it, so a save waits on no more steps than the settling takes.
   */
  const settleFailedSave = useCallback(
    (error: unknown): Promise<void> => {
      if (error instanceof APIError) {
        if (error.status === 423) return settleLockedBatch(error.body)
        if (error.status === 404 || error.status === 422) return settleGoneDogs(error)
      }
      // A conflict arrives as a rejected 409 rather than a value, and its body carries both versions.
      const answer = resultConflictResponse(error)
      if (answer) return settleConflict(answer)
      // Anything else, a dropped connection or a server error, keeps the entered scores on screen and says
      // so. The button only stops spinning, which reads as success.
      reportError(error)
      enqueueSnackbar(t('results.saveFailed'), errorSnackbarOptions)
      return Promise.resolve()
    },
    [settleConflict, settleGoneDogs, settleLockedBatch, t]
  )

  const handleSave = useCallback(async () => {
    const submissions = Object.entries(edits).map(([id, edit]) => submissionFor(id, edit))
    if (submissions.length === 0) return

    try {
      // Stored is stored: the action folds what came back into the rows, so the result stays on screen.
      const response = await saveResults(submissions)
      finishSave(response.saved.length)
    } catch (error) {
      await settleFailedSave(error)
    }
  }, [edits, finishSave, saveResults, settleFailedSave, submissionFor])

  const handleResolve = useCallback(async () => {
    // Only the dogs the secretary decided to overrule are sent again, each based on the version that
    // beat it, so this save is no longer a conflict.
    const mine = conflicts.filter((conflict) => choices[conflict.id] === 'mine')
    const submissions = mine.map((conflict) =>
      submissionFor(conflict.id, edits[conflict.id] ?? emptyEdit, conflict.stored)
    )

    if (submissions.length) {
      try {
        const response = await saveResults(submissions)
        finishSave(response.saved.length)
      } catch (error) {
        // The dialog stays up with the edits behind it, or shows the conflicts that beat this save too.
        await settleFailedSave(error)
        return
      }
    } else {
      settleEdits(() => true)
    }

    setConflicts([])
    setChoices({})
  }, [choices, conflicts, edits, finishSave, saveResults, settleEdits, settleFailedSave, submissionFor])

  if (!event?.id) return <EventNotFound />

  return (
    <Paper
      elevation={2}
      sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100%', maxWidth: '100%' }}
    >
      <EntryPageHeader event={event} title={t('results.title')}>
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
      {/* Sending and handing over are a step of the event view (KOE-1579); here it is only said where things stand. */}
      {!locked && kennelliitto && sentCount > 0 && (
        <Alert severity="info" sx={{ mt: 1, mx: { md: 2, xs: 1 } }}>
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
        {dayPosts.length > 0 && (
          <TextField
            label={t('results.scope')}
            onChange={(e) => setPickedScope(e.target.value)}
            select
            size="small"
            sx={{ minWidth: 180 }}
            value={scope}
          >
            <MenuItem value={WHOLE_ROUND}>{t('results.scopeAll')}</MenuItem>
            {dayPosts.map((station) => (
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
          fullRoundFor={scoped ? undefined : fullRoundFor}
          onChange={handleChange}
          placements={scoped ? undefined : placements}
          defaultJudges={defaultJudges}
          judges={eventJudges}
          judgesFor={judgesFor}
          kennelliitto={kennelliitto}
          onJudgeChange={(id, judge) => setDefaultJudges((prev) => ({ ...prev, [id]: judge }))}
          registrations={tableRows}
          round={round}
          roundFor={roundFor}
          stationId={scoped ? scope : undefined}
          stations={dayPosts}
          wholeRoundFor={fullRoundFor}
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

      <ConflictDialog
        choices={choices}
        conflicts={conflicts}
        eventType={event.eventType}
        exercisesOf={scoped ? exercisesOfDog : undefined}
        onChoose={(id, choice) => setChoices((prev) => ({ ...prev, [id]: choice }))}
        onClose={() => setConflicts([])}
        onResolve={handleResolve}
        registrations={classRegistrations}
      />
    </Paper>
  )
}
