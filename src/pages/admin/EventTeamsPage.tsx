import type { TFunction } from 'i18next'
import type { TeamError } from '@/lib/team'
import type { DogEvent, EventTeam, Registration } from '@/types'
import Cancel from '@mui/icons-material/Cancel'
import Save from '@mui/icons-material/Save'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning'
import { MAX_TEAM_MEMBERS, teamErrors } from '@/lib/team'
import { Path } from '@/routeConfig'
import { AsyncButton } from '../components/AsyncButton'
import { EntryPageHeader } from './components/EntryPageHeader'
import EventNotFound from './components/EventNotFound'
import TeamCard from './eventTeamsPage/TeamCard'
import useEventForm from './hooks/useEventForm'
import { adminEventAtom, adminEventRegistrationsAtom } from './state'
import { useAdminEventScope } from './state/eventScope'

const NO_TEAMS: EventTeam[] = []

/** The teams as many as the count asks: new ones empty at the end, the last ones dropped. */
const resized = (teams: EventTeam[], count: number): EventTeam[] =>
  count <= teams.length
    ? teams.slice(0, count)
    : [...teams, ...Array.from({ length: count - teams.length }, (): EventTeam => ({ registrationIds: [] }))]

/**
 * The event with these teams. None is no team competition: an event that stored no teams gets none, and
 * one that did stores the empty list, which a save of the whole event carries too.
 */
const withTeams = (event: DogEvent, teams: EventTeam[], stored: EventTeam[] | undefined): DogEvent => {
  const { teams: _teams, ...rest } = event
  return teams.length || stored ? { ...rest, teams } : rest
}

/** The count typed, or undefined while the field holds no whole number of teams. */
const typedCount = (value: string): number | undefined => {
  const count = Number(value)
  return value !== '' && Number.isInteger(count) && count >= 0 ? count : undefined
}

const teamErrorMessage = (error: TeamError, entries: ReadonlyMap<string, Registration>, t: TFunction) =>
  error.kind === 'tooMany'
    ? t('teams.error.tooMany', { count: MAX_TEAM_MEMBERS, number: error.team + 1 })
    : t('teams.error.twice', { dog: entries.get(error.registrationId)?.dog.name ?? '' })

/**
 * The teams of a team competition (KOE-1714), on a page of their own like the posts: any event can run
 * one, and the count is what turns it on. The draft is the event form's, so the secretary saves or
 * cancels the teams as one.
 */
export default function EventTeamsPage() {
  const { t } = useTranslation()
  const { id: eventId = '' } = useParams()
  useAdminEventScope(eventId)
  const storedEvent = useAtomValue(adminEventAtom(eventId))
  const registrations = useAtomValue(adminEventRegistrationsAtom(eventId))
  const { event, canSave, discardChanges, handleChange, handleSave, handleCancel } = useEventForm({
    eventId,
    onDoneRedirect: Path.admin.viewEvent(eventId),
    savedMessage: t('teams.saved'),
    storedEvent,
  })

  // The draft lives in session storage, so leaving must lose it as the question says, as on the posts page.
  useUnsavedChangesWarning(canSave, discardChanges)

  const teams = event?.teams ?? NO_TEAMS
  const entries = useMemo(
    () => new Map(registrations.map((registration) => [registration.id, registration])),
    [registrations]
  )
  const available = useMemo(() => {
    const taken = new Set(teams.flatMap((team) => team.registrationIds))
    return registrations.filter((registration) => !registration.cancelled && !taken.has(registration.id))
  }, [registrations, teams])
  const errors = useMemo(
    () => teamErrors(teams).map((error) => teamErrorMessage(error, entries, t)),
    [entries, teams, t]
  )

  const setTeams = useCallback(
    (next: EventTeam[]) => {
      if (event) handleChange(withTeams(event, next, storedEvent?.teams))
    },
    [event, handleChange, storedEvent?.teams]
  )

  // What the field holds while it is being typed in: clearing it to type another count drops no team.
  const [countText, setCountText] = useState<string>()
  const handleCount = useCallback(
    (value: string) => {
      setCountText(value)
      const count = typedCount(value)
      if (count !== undefined) setTeams(resized(teams, count))
    },
    [setTeams, teams]
  )

  if (!event?.id) {
    return <EventNotFound />
  }

  return (
    <Paper
      elevation={2}
      sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100%', maxWidth: '100%' }}
    >
      <EntryPageHeader event={storedEvent?.id ? storedEvent : event} title={t('teams.title')}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('teams.info')}
        </Typography>
      </EntryPageHeader>
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
        <Stack spacing={2}>
          <TextField
            label={t('teams.count')}
            onBlur={() => setCountText(undefined)}
            onChange={(e) => handleCount(e.target.value)}
            size="small"
            slotProps={{ htmlInput: { min: 0 } }}
            sx={{ width: 200 }}
            type="number"
            value={countText ?? teams.length}
          />
          {teams.map((team, index) => (
            <TeamCard
              // A team is its place in the list: its number. Only the last ones come and go.
              // biome-ignore lint/suspicious/noArrayIndexKey: the place is the team's identity (KOE-1714)
              key={index}
              available={available}
              entries={entries}
              number={index + 1}
              onChange={(changed) => setTeams(teams.map((item, at) => (at === index ? changed : item)))}
              team={team}
            />
          ))}
        </Stack>
      </Box>
      {errors.length > 0 && (
        <Alert severity="error" sx={{ mx: 2 }}>
          <AlertTitle>{t('teams.errorsTitle')}</AlertTitle>
          {errors.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </Alert>
      )}
      <Stack
        spacing={1}
        direction="row"
        sx={{ borderColor: '#bdbdbd', borderTop: '1px solid', justifyContent: 'flex-end', p: 1 }}
      >
        <AsyncButton
          color="primary"
          disabled={!canSave || errors.length > 0}
          startIcon={<Save />}
          variant="contained"
          onClick={handleSave}
        >
          {t('save')}
        </AsyncButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={handleCancel}>
          {t('cancel')}
        </Button>
      </Stack>
    </Paper>
  )
}
