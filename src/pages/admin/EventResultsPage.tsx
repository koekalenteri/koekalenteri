import type { DogEvent, EventResult, EventStation, Patch, PublicJudge } from '../../types'
import type { ConflictChoice, ResultConflict } from './eventResultsPage/ConflictDialog'
import type { ResultEdit } from './eventResultsPage/types'
import ArrowBack from '@mui/icons-material/ArrowBack'
import Save from '@mui/icons-material/Save'
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
import { putEventResults } from '../../api/registration'
import { reportError } from '../../lib/client/error'
import { errorSnackbarOptions } from '../../lib/client/snackbar'
import {
  getRegistrationClass,
  isScorableRegistration,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../lib/registration'
import { classRound, scoresAtPosts, stationVersion } from '../../lib/results'
import { Path } from '../../routeConfig'
import { AsyncButton } from '../components/AsyncButton'
import { idTokenAtom } from '../state'
import EventNotFound from './components/EventNotFound'
import { makeArray } from './components/eventForm/judgeSection/utils'
import { KcIdLookupButton } from './components/KcIdLookupButton'
import { ConflictDialog } from './eventResultsPage/ConflictDialog'
import ResultsTable from './eventResultsPage/ResultsTable'
import { emptyEdit } from './eventResultsPage/types'
import { adminConfirmedEventAtom, adminEventRegistrationsAtom, useAdminEventActions } from './state'

/** The whole round, or one post's slice of it. */
const WHOLE_ROUND = 'all'

const isResultConflictBody = (body: unknown): body is { conflicts: ResultConflict[] } =>
  typeof body === 'object' && body !== null && Array.isArray((body as { conflicts?: unknown }).conflicts)

export default function EventResultsPage() {
  const { t } = useTranslation()
  const { id: eventId = '' } = useParams()
  const token = useAtomValue(idTokenAtom)
  const event = useAtomValue(adminConfirmedEventAtom(eventId))
  const registrations = useAtomValue(adminEventRegistrationsAtom(eventId))

  const classes = useMemo(
    () => [...new Set(registrations.filter(isScorableRegistration).map(getRegistrationClass))],
    [registrations]
  )
  const [selectedClass, setSelectedClass] = useState<string | undefined>(classes[0])
  const [scope, setScope] = useState<string>(WHOLE_ROUND)
  const [edits, setEdits] = useState<Record<string, ResultEdit>>({})
  const [defaultJudges, setDefaultJudges] = useState<Record<string, PublicJudge | undefined>>({})
  const [conflicts, setConflicts] = useState<ResultConflict[]>([])
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({})

  const eventClass = selectedClass ?? classes[0]
  const stations: EventStation[] = useMemo(
    () => (scoresAtPosts(event?.eventType) ? (event?.stations ?? []) : []),
    [event?.eventType, event?.stations]
  )

  const rows = useMemo(
    () =>
      registrations
        .filter((reg) => isScorableRegistration(reg) && getRegistrationClass(reg) === eventClass)
        .sort(sortRegistrationsByDateClassTimeAndNumber),
    [eventClass, registrations]
  )

  const fullRound = useMemo(() => {
    const classStations = event?.classes?.find((item) => item.class === eventClass)?.stations
    return classRound(stations, classStations)
  }, [event?.classes, eventClass, stations])

  // A post's own view narrows the columns; the prize is withheld there, because it depends on posts
  // this view cannot see and a partial figure would read as a verdict.
  const scoped = scope !== WHOLE_ROUND
  const round = useMemo(
    () => (scoped ? fullRound.filter((task) => task.stationId === scope) : fullRound),
    [fullRound, scope, scoped]
  )

  // A post names its own judges; where it names none, the class's judge stands for it.
  const classJudges = useMemo(
    () => makeArray(event?.classes?.find((item) => item.class === eventClass)?.judge),
    [event?.classes, eventClass]
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

  const handleChange = useCallback(
    (registrationId: string, edit: ResultEdit) => setEdits((prev) => ({ ...prev, [registrationId]: edit })),
    []
  )

  const submissionFor = useCallback(
    (id: string, edit: ResultEdit, overrideBase?: EventResult) => {
      const stored = overrideBase ?? registrations.find((reg) => reg.id === id)?.eventResult

      return {
        // The version this edit was made against, so the server can tell a second writer from a retry.
        basedOn: scoped ? stationVersion(stored?.tasks, scope) : stored?.updatedAt,
        eventResult: { elimination: edit.elimination, retirement: edit.retirement, tasks: edit.tasks },
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

  const handleSave = useCallback(async () => {
    const submissions = Object.entries(edits).map(([id, edit]) => submissionFor(id, edit))
    if (submissions.length === 0) return

    try {
      const response = await putEventResults(eventId, submissions, token ?? '')
      report(response.saved.length)
      setEdits({})
    } catch (error) {
      // A conflict arrives as a rejected 409 rather than a value, and its body carries both versions.
      const body = error instanceof APIError && error.status === 409 ? error.body : undefined
      if (!isResultConflictBody(body)) {
        // Anything else — the server refusing a dog that did not run, a dropped connection — keeps the
        // entered scores on screen and says so. The button only stops spinning, which reads as success.
        reportError(error)
        enqueueSnackbar(t('results.saveFailed'), errorSnackbarOptions)
        return
      }

      // Whatever did not conflict is already written; keep only the disputed dogs on screen.
      setEdits((prev) => Object.fromEntries(body.conflicts.map(({ id }) => [id, prev[id] ?? emptyEdit])))
      setConflicts(body.conflicts)
      setChoices({})
    }
  }, [edits, eventId, report, submissionFor, t, token])

  const handleResolve = useCallback(async () => {
    // Only the dogs the secretary decided to overrule are sent again, each based on the version that
    // beat it, so this save is no longer a conflict.
    const mine = conflicts.filter((conflict) => choices[conflict.id] === 'mine')
    const submissions = mine.map((conflict) =>
      submissionFor(conflict.id, edits[conflict.id] ?? emptyEdit, conflict.stored)
    )

    if (submissions.length) {
      const response = await putEventResults(eventId, submissions, token ?? '')
      report(response.saved.length)
    }

    setConflicts([])
    setChoices({})
    setEdits({})
  }, [choices, conflicts, edits, eventId, report, submissionFor, token])

  if (!event?.id) return <EventNotFound />

  return (
    <Paper
      elevation={2}
      sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100%', maxWidth: '100%' }}
    >
      <Box sx={{ pt: 2, px: 2 }}>
        <Button
          component={Link}
          size="small"
          startIcon={<ArrowBack fontSize="small" />}
          sx={{ ml: -1 }}
          to={Path.admin.viewEvent(eventId)}
        >
          {t('results.backToEvent')}
        </Button>
        <Typography variant="h6">{t('results.title')}</Typography>
        {event.kcId ? (
          <Typography variant="body2" color="text.secondary">
            {t('event.kcId')}: {event.kcId}
          </Typography>
        ) : (
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              {t('event.kcIdEmpty')}
            </Typography>
            <KcIdLookupButton event={event} onChange={saveKcId} variant="text" />
          </Stack>
        )}
      </Box>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ pt: 1, px: 2 }}>
        <Tabs onChange={(_event, value) => setSelectedClass(value)} value={eventClass ?? false}>
          {classes.map((item) => (
            <Tab key={item} label={item} value={item} />
          ))}
        </Tabs>
        {scoped && (
          <Button component={Link} size="small" to={Path.admin.stationResults(eventId, scope)} variant="outlined">
            {t('results.openStationView')}
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

      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
        <ResultsTable
          edits={edits}
          eventClass={eventClass}
          eventType={event.eventType}
          fullRound={scoped ? undefined : fullRound}
          onChange={handleChange}
          defaultJudges={defaultJudges}
          judgesFor={judgesFor}
          onJudgeChange={(id, judge) => setDefaultJudges((prev) => ({ ...prev, [id]: judge }))}
          registrations={rows}
          round={round}
          stationId={scoped ? scope : undefined}
          stations={stations}
        />
      </Box>

      <Stack
        direction="row"
        justifyContent="flex-end"
        spacing={1}
        sx={{ borderColor: '#bdbdbd', borderTop: '1px solid', p: 1 }}
      >
        <AsyncButton
          color="primary"
          disabled={Object.keys(edits).length === 0}
          onClick={handleSave}
          startIcon={<Save />}
          variant="contained"
        >
          {t('save')}
        </AsyncButton>
      </Stack>

      <ConflictDialog
        choices={choices}
        conflicts={conflicts}
        onChoose={(id, choice) => setChoices((prev) => ({ ...prev, [id]: choice }))}
        onClose={() => setConflicts([])}
        onResolve={handleResolve}
        registrations={rows}
      />
    </Paper>
  )
}
