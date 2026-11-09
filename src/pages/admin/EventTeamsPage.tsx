import type { TeamSuggestion } from '@/lib/client/teamAssembly'
import type { TeamStanding } from '@/lib/teamStandings'
import type { DogEvent, EventTeam, TeamCompetition } from '@/types'
import Cancel from '@mui/icons-material/Cancel'
import Save from '@mui/icons-material/Save'
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
import { teamSuggestions } from '@/lib/client/teamAssembly'
import { withStoredTotals } from '@/lib/results'
import { teamSeriesName } from '@/lib/startListView'
import { isTeamCandidate, teamCompetitionErrors, teamCountedDays, teamTrialDays } from '@/lib/team'
import { teamStandings, withRunOffWinner } from '@/lib/teamStandings'
import { Path } from '@/routeConfig'
import { AsyncButton } from '../components/AsyncButton'
import { languageAtom } from '../state/user/atoms'
import { EntryPageHeader } from './components/EntryPageHeader'
import EventNotFound from './components/EventNotFound'
import TeamCard from './eventTeamsPage/TeamCard'
import TeamCompetitionSettings from './eventTeamsPage/TeamCompetitionSettings'
import TeamSuggestions from './eventTeamsPage/TeamSuggestions'
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

/**
 * The event with these competition settings (KOE-1720), and its teams out of a series removed with
 * them, as the save has them refused otherwise (`unknownSeries`). Settings left empty are none.
 */
const withTeamCompetition = (event: DogEvent, teamCompetition: TeamCompetition, removedSeriesId?: string): DogEvent => {
  const { teamCompetition: _teamCompetition, ...rest } = event
  const teams = removedSeriesId
    ? event.teams?.map((team) => {
        if (team.seriesId !== removedSeriesId) return team
        const { seriesId: _seriesId, ...left } = team
        return left
      })
    : event.teams
  return {
    ...rest,
    ...(Object.keys(teamCompetition).length ? { teamCompetition } : {}),
    ...(teams ? { teams } : {}),
  }
}

/**
 * The teams with a suggestion made into one (KOE-1721): its name, its dogs and its first-team mark, in
 * the first team still empty, of no name and no dogs, or else in a new team at the end.
 */
const withSuggestion = (teams: EventTeam[], { name, primary, registrationIds }: TeamSuggestion): EventTeam[] => {
  const team: EventTeam = { name, ...(primary ? { primary } : {}), registrationIds }
  const empty = teams.findIndex((item) => !item.name && !item.registrationIds.length)
  return empty < 0 ? [...teams, team] : teams.map((item, at) => (at === empty ? { ...item, ...team } : item))
}

/** The count typed, or undefined while the field holds no whole number of teams. */
const typedCount = (value: string): number | undefined => {
  const count = Number(value)
  return value !== '' && Number.isInteger(count) && count >= 0 ? count : undefined
}

/**
 * The teams of a team competition (KOE-1714), on a page of their own like the posts: any event can run
 * one, and the count is what turns it on. The competition's settings are set here too, before any team
 * is made: whether the entry form asks for the dog's team (KOE-1721), the series, and each team's
 * series; the standings are worked out series by series (KOE-1720). The names given at entry are
 * suggested as teams. The page edits a draft of its own (KOE-1700), so the secretary saves or cancels
 * the teams as one.
 */
export default function EventTeamsPage() {
  const { t } = useTranslation()
  const { id: eventId = '' } = useParams()
  useAdminEventScope(eventId)
  const storedEvent = useAtomValue(adminEventAtom(eventId))
  const registrations = useAtomValue(adminEventRegistrationsAtom(eventId))
  const language = useAtomValue(languageAtom)
  const { event, canSave, discardChanges, handleChange, handleSave, handleCancel } = useEventForm({
    eventId,
    form: 'teams',
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
  // The dogs a team may take, by the rule the save holds to (`isTeamCandidate`, KOE-1725): once a class is
  // picked, only its picked dogs. A dog already in a team is in no other.
  const available = useMemo(() => {
    const taken = new Set(teams.flatMap((team) => team.registrationIds))
    return registrations.filter(
      (registration) => !!event && isTeamCandidate(event, registration) && !taken.has(registration.id)
    )
  }, [event, registrations, teams])
  // The teams the names given at entry make, of the dogs in none yet (KOE-1721).
  const suggestions = useMemo(
    () => (event ? teamSuggestions({ ...event, teams }, registrations) : []),
    [event, registrations, teams]
  )
  // A team is its number, its place in the list: only the last ones come and go (KOE-1714).
  const numbered = useMemo(() => teams.map((team, index) => ({ number: index + 1, team })), [teams])
  // The standings of the draft, so a run-off marked shows before it is saved; the totals a round stored
  // before KOE-1669 lacks are worked out as the start list does (KOE-1717).
  const standings = useMemo(() => {
    if (!event) return new Map<number, TeamStanding>()
    const scored = registrations.map((registration) => withStoredTotals(event, registration))
    return new Map(teamStandings(event, teams, scored).map((standing) => [standing.team, standing]))
  }, [event, registrations, teams])

  // The series as the teams' choice names them, in the secretary's language (KOE-1720).
  const series = useMemo(
    () =>
      (event?.teamCompetition?.series ?? []).map(({ id }) => ({ id, name: teamSeriesName(event ?? {}, id, language) })),
    [event, language]
  )

  // The trial's days for the choice of those the teams count, and the days a team's points come from
  // where the choice leaves some out (KOE-1726).
  const trialDays = useMemo(() => (event ? teamTrialDays(event) : []), [event])
  const countedDays = useMemo(() => (event ? teamCountedDays(event) : []), [event])

  // A series the save would refuse, unnamed in Finnish or given an id twice, keeps the save closed: the
  // rule the server holds the settings to (`teamCompetitionErrors`, KOE-1720).
  const seriesUnsettled = teamCompetitionErrors(event?.teamCompetition).length > 0

  const handleTeamCompetition = useCallback(
    (teamCompetition: TeamCompetition, removedSeriesId?: string) => {
      if (event) handleChange(withTeamCompetition(event, teamCompetition, removedSeriesId))
    },
    [event, handleChange]
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
          <TeamCompetitionSettings
            teamCompetition={event.teamCompetition}
            trialDays={trialDays}
            onChange={handleTeamCompetition}
          />
          <TeamSuggestions
            entries={entries}
            onTake={(suggestion) => setTeams(withSuggestion(teams, suggestion))}
            suggestions={suggestions}
          />
          {numbered.map(({ number, team }) => (
            <TeamCard
              key={number}
              available={available}
              entries={entries}
              number={number}
              onChange={(changed) => setTeams(teams.map((item, at) => (at === number - 1 ? changed : item)))}
              onRunOffChange={(won) => setTeams(withRunOffWinner(teams, number - 1, won))}
              series={series}
              countedDays={countedDays}
              standing={standings.get(number - 1)}
              team={team}
            />
          ))}
        </Stack>
      </Box>
      <Stack
        spacing={1}
        direction="row"
        sx={{ borderColor: '#bdbdbd', borderTop: '1px solid', justifyContent: 'flex-end', p: 1 }}
      >
        <AsyncButton
          color="primary"
          disabled={!canSave || seriesUnsettled}
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
