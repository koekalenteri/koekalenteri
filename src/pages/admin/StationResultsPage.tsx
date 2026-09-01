import type { PublicJudge, Registration } from '../../types'
import type { ResultEdit } from './eventResultsPage/types'
import Save from '@mui/icons-material/Save'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { putEventResults } from '../../api/registration'
import {
  getRegistrationClass,
  isScorableRegistration,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../lib/registration'
import { classRound, stationVersion } from '../../lib/results'
import { AsyncButton } from '../components/AsyncButton'
import { idTokenAtom } from '../state'
import EventNotFound from './components/EventNotFound'
import { makeArray } from './components/eventForm/judgeSection/utils'
import { RoundOutcome } from './eventResultsPage/RoundOutcomeCell'
import { TaskScore } from './eventResultsPage/TaskCell'
import { emptyEdit, isVoided } from './eventResultsPage/types'
import { adminConfirmedEventAtom, adminEventRegistrationsAtom } from './state'

/**
 * Scoring at the post, while the test runs.
 *
 * The dog in front of the judge is the whole screen: it arrives, it is picked from the list — usually
 * the next start number — and one score goes in. The table views are for going through a class; this is
 * for going through the day, and saving one dog at a time is what makes it usable on a phone.
 */
export default function StationResultsPage() {
  const { t } = useTranslation()
  const { id: eventId = '', stationId = '' } = useParams()
  const token = useAtomValue(idTokenAtom)
  const event = useAtomValue(adminConfirmedEventAtom(eventId))
  const registrations = useAtomValue(adminEventRegistrationsAtom(eventId))

  const classes = useMemo(
    () => [...new Set(registrations.filter(isScorableRegistration).map(getRegistrationClass))],
    [registrations]
  )
  const [selectedClass, setSelectedClass] = useState<string | undefined>(classes[0])
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [edit, setEdit] = useState<ResultEdit>(emptyEdit)
  const [lastJudge, setLastJudge] = useState<PublicJudge | undefined>()

  const eventClass = selectedClass ?? classes[0]
  const station = event?.stations?.find((item) => item.id === stationId)

  const dogs = useMemo(
    () =>
      registrations
        .filter((reg) => isScorableRegistration(reg) && getRegistrationClass(reg) === eventClass)
        .sort(sortRegistrationsByDateClassTimeAndNumber),
    [eventClass, registrations]
  )

  // Only this post's slots, which is one task or two.
  const round = useMemo(() => {
    const classStations = event?.classes?.find((item) => item.class === eventClass)?.stations
    return classRound(event?.stations ?? [], classStations).filter((task) => task.stationId === stationId)
  }, [event?.classes, event?.stations, eventClass, stationId])

  const judges = useMemo(() => {
    const own = station?.judges ?? []
    const classJudges = makeArray(event?.classes?.find((item) => item.class === eventClass)?.judge)
    return (own.length ? own : classJudges).filter((judge): judge is PublicJudge => Boolean(judge?.id))
  }, [event?.classes, eventClass, station?.judges])

  const selected = dogs.find((dog) => dog.id === selectedId)

  /** A dog this post has already scored, so the judge can see at a glance who is still to come. */
  const isScored = useCallback(
    (dog: Registration) => dog.eventResult?.tasks?.some((task) => task.stationId === stationId) ?? false,
    [stationId]
  )

  const select = useCallback(
    (dog: Registration) => {
      setSelectedId(dog.id)
      // Start from what this post already recorded, so a correction edits rather than replaces.
      const tasks = (dog.eventResult?.tasks ?? [])
        .filter((task) => task.stationId === stationId)
        .map(({ updatedAt: _at, updatedBy: _by, ...task }) => task)

      setEdit({ elimination: dog.eventResult?.elimination, retirement: dog.eventResult?.retirement, tasks })
    },
    [stationId]
  )

  const handleSave = useCallback(async () => {
    if (!selected) return

    const stored = selected.eventResult
    const response = await putEventResults(
      eventId,
      [
        {
          basedOn: stationVersion(stored?.tasks, stationId),
          eventResult: { elimination: edit.elimination, retirement: edit.retirement, tasks: edit.tasks },
          id: selected.id,
          stationId,
        },
      ],
      token ?? ''
    )

    enqueueSnackbar(response.saved.length ? t('results.saved') : t('results.alreadySaved'), { variant: 'success' })

    // Move on to the next dog that has not been through this post: at a post the queue is the job.
    const next = dogs.find((dog) => !isScored(dog) && dog.id !== selected.id)
    if (next) select(next)
    else setSelectedId(undefined)
  }, [dogs, edit, eventId, isScored, select, selected, stationId, t, token])

  if (!event?.id || !station) return <EventNotFound />

  return (
    <Paper
      elevation={2}
      sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100%', maxWidth: '100%' }}
    >
      <Box sx={{ pt: 2, px: 2 }}>
        <Typography variant="h6">
          {t('event.station')} {station.number}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {event.name || event.eventType}
          {event.kcId ? ` · ${t('event.kcId')} ${event.kcId}` : ''}
        </Typography>
      </Box>

      <Tabs onChange={(_event, value) => setSelectedClass(value)} sx={{ px: 2 }} value={eventClass ?? false}>
        {classes.map((item) => (
          <Tab key={item} label={item} value={item} />
        ))}
      </Tabs>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, p: 2 }}>
        {dogs.map((dog) => (
          <Chip
            color={dog.id === selectedId ? 'primary' : 'default'}
            key={dog.id}
            label={`${dog.group?.number ?? '?'} ${dog.dog.name ?? ''}`}
            onClick={() => select(dog)}
            variant={isScored(dog) ? 'filled' : 'outlined'}
          />
        ))}
      </Box>

      {selected && (
        <Stack spacing={2} sx={{ flexGrow: 1, overflow: 'auto', px: 2 }}>
          <Typography variant="h6">
            {selected.group?.number}. {selected.dog.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {selected.handler?.name}
          </Typography>

          <Stack direction="row" spacing={2}>
            {round.map((task) => (
              <TaskScore
                defaultJudge={lastJudge}
                disabled={isVoided(edit)}
                judges={judges}
                key={`${task.stationId}#${task.index}`}
                onChange={(item, points, zeroFault) =>
                  setEdit((prev) => ({
                    ...prev,
                    tasks: [
                      ...prev.tasks.filter((entry) => entry.index !== item.index),
                      {
                        index: item.index,
                        judge: prev.tasks.find((entry) => entry.index === item.index)?.judge ?? lastJudge ?? judges[0],
                        points,
                        stationId: item.stationId,
                        ...(zeroFault ? { zeroFault } : {}),
                      },
                    ],
                  }))
                }
                onJudgeChange={(item, judge) => {
                  setLastJudge(judge)
                  setEdit((prev) => ({
                    ...prev,
                    tasks: prev.tasks.map((entry) => (entry.index === item.index ? { ...entry, judge } : entry)),
                  }))
                }}
                task={task}
                value={edit.tasks.find((entry) => entry.index === task.index)}
              />
            ))}
          </Stack>

          <RoundOutcome
            eventType={event.eventType}
            onChange={setEdit}
            stationId={stationId}
            stations={[]}
            value={edit}
          />
        </Stack>
      )}

      <Stack direction="row" justifyContent="flex-end" sx={{ borderColor: '#bdbdbd', borderTop: '1px solid', p: 1 }}>
        <AsyncButton color="primary" disabled={!selected} onClick={handleSave} startIcon={<Save />} variant="contained">
          {t('results.save')}
        </AsyncButton>
      </Stack>
    </Paper>
  )
}
