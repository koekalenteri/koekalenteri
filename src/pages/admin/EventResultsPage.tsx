import type { EventResult, EventStation } from '../../types'
import type { ConflictChoice, ResultConflict } from './eventResultsPage/ConflictDialog'
import type { ResultEdit } from './eventResultsPage/types'
import Save from '@mui/icons-material/Save'
import Box from '@mui/material/Box'
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
import { useParams } from 'react-router'
import { APIError } from '../../api/http'
import { putEventResults } from '../../api/registration'
import { getRegistrationClass, sortRegistrationsByDateClassTimeAndNumber } from '../../lib/registration'
import { classRound, scoresAtPosts, stationVersion } from '../../lib/results'
import { AsyncButton } from '../components/AsyncButton'
import { idTokenAtom } from '../state'
import EventNotFound from './components/EventNotFound'
import { ConflictDialog } from './eventResultsPage/ConflictDialog'
import ResultsTable from './eventResultsPage/ResultsTable'
import { emptyEdit } from './eventResultsPage/types'
import { adminConfirmedEventAtom, adminEventRegistrationsAtom } from './state'

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
    () => [...new Set(registrations.filter((reg) => !reg.cancelled).map(getRegistrationClass))],
    [registrations]
  )
  const [selectedClass, setSelectedClass] = useState<string | undefined>(classes[0])
  const [scope, setScope] = useState<string>(WHOLE_ROUND)
  const [edits, setEdits] = useState<Record<string, ResultEdit>>({})
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
        .filter((reg) => !reg.cancelled && getRegistrationClass(reg) === eventClass)
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
      if (!isResultConflictBody(body)) throw error

      // Whatever did not conflict is already written; keep only the disputed dogs on screen.
      setEdits((prev) => Object.fromEntries(body.conflicts.map(({ id }) => [id, prev[id] ?? emptyEdit])))
      setConflicts(body.conflicts)
      setChoices({})
    }
  }, [edits, eventId, report, submissionFor, token])

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
        <Typography variant="h6">{t('results.title')}</Typography>
        {event.kcId ? (
          <Typography variant="body2" color="text.secondary">
            {t('event.kcId')}: {event.kcId}
          </Typography>
        ) : null}
      </Box>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ pt: 1, px: 2 }}>
        <Tabs onChange={(_event, value) => setSelectedClass(value)} value={eventClass ?? false}>
          {classes.map((item) => (
            <Tab key={item} label={item} value={item} />
          ))}
        </Tabs>
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
