import type { TeamSelectionState } from '@/lib/teamSelection'
import type { TeamStanding } from '@/lib/teamStandings'
import type { DayKey, EventTeam, Registration } from '@/types'
import type { TeamMoveTarget } from './useMoveTeam'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import DeleteOutline from '@mui/icons-material/DeleteOutlined'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getHandlingPerson, isStarter } from '@/lib/registration'
import { formatTeamStanding } from '@/lib/startListView'
import { MAX_TEAM_MEMBERS, teamMembers } from '@/lib/team'
import { withTeamSeries } from '@/lib/teamStandings'
import AutocompleteSingle from '../../components/AutocompleteSingle'

interface Props {
  /** The team's number, from 1. */
  readonly number: number
  readonly team: EventTeam
  /** The event's entries by id, to show the members by. */
  readonly entries: ReadonlyMap<string, Registration>
  /** The entries the team may take: candidates (`isTeamCandidate`, KOE-1725) in no team yet. */
  readonly available: readonly Registration[]
  readonly onChange: (team: EventTeam) => void
  /** The team's points and placing over the trial, in a format scored at posts once a dog has a result. */
  readonly standing?: TeamStanding
  /** Records whether the team won the run-off for first place. */
  readonly onRunOffChange: (won: boolean) => void
  /** The competition's series by id and name as the secretary reads it (KOE-1720); none, no choice. */
  readonly series?: readonly { id: string; name: string }[]
  /** Where the team's dogs stand in the selection (`teamSelection`, KOE-1722). */
  readonly selection?: TeamSelectionState
  /** Moves the whole team to the participants or to the reserve list (KOE-1722). */
  readonly onMove?: (to: TeamMoveTarget) => void
  /** Why the team cannot be moved now, if it cannot: the page holds changes not saved. */
  readonly moveBlocked?: string
  /** The days the points come from where the competition counts only some (`teamCountedDays`, KOE-1726). */
  readonly countedDays?: readonly DayKey[]
}

interface TeamMoveProps {
  readonly selection: TeamSelectionState
  readonly onMove: (to: TeamMoveTarget) => void
  readonly moveBlocked?: string
}

/**
 * Where the team's dogs stand in the selection, and the moves of the whole team (KOE-1722): to the
 * participants while a dog is on the reserve list, to the reserve list while a dog is a participant.
 * The moves wait for the teams to be saved, so no dog moves for a team the secretary then cancels.
 */
const TeamMove = ({ selection, onMove, moveBlocked }: TeamMoveProps) => {
  const { t } = useTranslation()
  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2">{t('teams.selection', { context: selection })}</Typography>
        {selection !== 'selected' && (
          <Button disabled={!!moveBlocked} onClick={() => onMove('participants')} size="small" variant="outlined">
            {t('teams.toParticipants')}
          </Button>
        )}
        {selection !== 'reserve' && (
          <Button disabled={!!moveBlocked} onClick={() => onMove('reserve')} size="small" variant="outlined">
            {t('teams.toReserve')}
          </Button>
        )}
      </Stack>
      {moveBlocked && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {moveBlocked}
        </Typography>
      )}
    </Stack>
  )
}

/** The value of the series choice for a team in no series: a select takes no undefined. */
const NO_SERIES = ''

interface StandingProps {
  readonly standing?: TeamStanding
  readonly countedDays: Props['countedDays']
  readonly runOffWon: boolean
  readonly onRunOffChange: Props['onRunOffChange']
}

/**
 * The team's result over the trial (KOE-1717): its placing and points, and where it is tied for first,
 * whether it won the run-off task that decides first place.
 */
const TeamResult = ({ standing, countedDays, runOffWon, onRunOffChange }: StandingProps) => {
  const { t } = useTranslation()
  if (!standing) return null

  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Typography variant="body2">{`${t('teams.result')}: ${formatTeamStanding(standing, t, countedDays)}`}</Typography>
      {standing.runOff && (
        <FormControlLabel
          control={<Checkbox checked={runOffWon} onChange={(e) => onRunOffChange(e.target.checked)} size="small" />}
          label={t('teams.runOffWon')}
        />
      )}
    </Stack>
  )
}

const dogLabel = (registration: Registration) => registration.dog.name ?? registration.dog.regNo ?? ''

/** What the secretary is told of a member whose entry no longer runs as it did when it was added. */
const memberState = (registration: Registration): 'memberCancelled' | 'memberReserve' | undefined => {
  if (registration.cancelled) return 'memberCancelled'
  if (!isStarter(registration)) return 'memberReserve'
  return undefined
}

/**
 * One team of a team competition (KOE-1714): its number, its name, its series where the competition has
 * them (KOE-1720), and its dogs, each by its code (`teamMembers`). A dog's place is its letter, so moving
 * it is the only way to change one.
 */
export default function TeamCard({
  number,
  team,
  entries,
  available,
  onChange,
  standing,
  onRunOffChange,
  series = [],
  selection,
  onMove,
  moveBlocked,
  countedDays,
}: Props) {
  const { t } = useTranslation()
  const ids = team.registrationIds

  const handleName = useCallback(
    (name: string) => {
      const { name: _name, ...rest } = team
      onChange(name ? { ...rest, name } : rest)
    },
    [onChange, team]
  )

  const handleSeries = useCallback(
    (seriesId: string) => {
      onChange(withTeamSeries(team, seriesId === NO_SERIES ? undefined : seriesId))
    },
    [onChange, team]
  )

  const handleAdd = useCallback(
    (registration: Registration | null) => {
      if (registration) onChange({ ...team, registrationIds: [...ids, registration.id] })
    },
    [ids, onChange, team]
  )

  const swap = (at: number, other: number) => {
    const next = [...ids]
    next[at] = ids[other]
    next[other] = ids[at]
    onChange({ ...team, registrationIds: next })
  }

  const remove = (at: number) => onChange({ ...team, registrationIds: ids.filter((_, index) => index !== at) })

  const full = ids.length >= MAX_TEAM_MEMBERS
  const heading = t('teams.team', { number })

  return (
    <Paper component="section" aria-label={heading} variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1}>
        <Typography variant="h6" component="h2">
          {heading}
        </Typography>
        <TextField
          label={t('teams.name')}
          onChange={(e) => handleName(e.target.value)}
          size="small"
          value={team.name ?? ''}
        />
        {series.length > 0 && (
          <TextField
            select
            label={t('teams.teamSeries')}
            onChange={(e) => handleSeries(e.target.value)}
            size="small"
            value={team.seriesId ?? NO_SERIES}
          >
            <MenuItem value={NO_SERIES}>{t('teams.noSeries')}</MenuItem>
            {series.map(({ id, name }) => (
              <MenuItem key={id} value={id}>
                {name}
              </MenuItem>
            ))}
          </TextField>
        )}
        <TeamResult
          standing={standing}
          countedDays={countedDays}
          runOffWon={!!team.runOffWon}
          onRunOffChange={onRunOffChange}
        />
        {selection && onMove && selection !== 'empty' && (
          <TeamMove selection={selection} onMove={onMove} moveBlocked={moveBlocked} />
        )}
        {ids.length === 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('teams.noDogs')}
          </Typography>
        )}
        <List dense disablePadding>
          {teamMembers(team, number, entries).map(({ code, place: at, registration }) => {
            const state = memberState(registration)
            const handler = getHandlingPerson(registration)?.name
            return (
              <ListItem
                key={registration.id}
                disableGutters
                secondaryAction={
                  <>
                    <IconButton
                      aria-label={t('teams.moveUp', { code })}
                      disabled={at === 0}
                      onClick={() => swap(at, at - 1)}
                    >
                      <ArrowUpward fontSize="small" />
                    </IconButton>
                    <IconButton
                      aria-label={t('teams.moveDown', { code })}
                      disabled={at === ids.length - 1}
                      onClick={() => swap(at, at + 1)}
                    >
                      <ArrowDownward fontSize="small" />
                    </IconButton>
                    <IconButton aria-label={t('teams.remove', { code })} onClick={() => remove(at)}>
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </>
                }
                sx={{ pr: 16 }}
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <span>{`${code} ${dogLabel(registration)}`}</span>
                      {state && <Chip label={t(`teams.${state}`)} size="small" />}
                    </Stack>
                  }
                  secondary={handler ? t('teams.handler', { name: handler }) : undefined}
                />
              </ListItem>
            )
          })}
        </List>
        <AutocompleteSingle<Registration, false>
          // A new input after each pick, so the field is empty for the next dog.
          key={ids.length}
          blurOnSelect
          disabled={full}
          getOptionLabel={dogLabel}
          getOptionKey={(registration) => registration.id}
          helperText={full ? t('teams.addDogFull', { count: MAX_TEAM_MEMBERS }) : undefined}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          label={t('teams.addDog')}
          onChange={handleAdd}
          options={available}
          size="small"
          value={null}
        />
      </Stack>
    </Paper>
  )
}
