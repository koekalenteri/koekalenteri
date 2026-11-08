import type { EventTeam, Registration } from '@/types'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import DeleteOutline from '@mui/icons-material/DeleteOutlined'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { getHandlingPerson, isStarter } from '@/lib/registration'
import { MAX_TEAM_MEMBERS, teamMembers } from '@/lib/team'
import AutocompleteSingle from '../../components/AutocompleteSingle'

interface Props {
  /** The team's number, from 1. */
  readonly number: number
  readonly team: EventTeam
  /** The event's entries by id, to show the members by. */
  readonly entries: ReadonlyMap<string, Registration>
  /** The entries the team may take: not cancelled, and in no team yet. */
  readonly available: readonly Registration[]
  readonly onChange: (team: EventTeam) => void
}

const dogLabel = (registration: Registration) => registration.dog.name ?? registration.dog.regNo ?? ''

/** What the secretary is told of a member whose entry no longer runs as it did when it was added. */
const memberState = (registration: Registration): 'memberCancelled' | 'memberReserve' | undefined => {
  if (registration.cancelled) return 'memberCancelled'
  if (!isStarter(registration)) return 'memberReserve'
  return undefined
}

/**
 * One team of a team competition (KOE-1714): its number, its name and its dogs, each by its code
 * (`teamMembers`). A dog's place is its letter, so moving it is the only way to change one.
 */
export default function TeamCard({ number, team, entries, available, onChange }: Props) {
  const { t } = useTranslation()
  const ids = team.registrationIds

  const handleName = useCallback(
    (name: string) => {
      const { name: _name, ...rest } = team
      onChange(name ? { ...rest, name } : rest)
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
