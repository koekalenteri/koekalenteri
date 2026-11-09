import type {
  DogEvent,
  EventClass,
  EventState,
  EventTeam,
  JsonDogEvent,
  JsonRegistration,
  TeamCompetition,
} from '../types'
import { getEventStateForClass } from './event'
import { isStarter } from './registration'

/** The letters a team's dogs are told apart by: so many dogs a team can hold (KOE-1714). */
const MEMBER_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const MAX_TEAM_MEMBERS = MEMBER_LETTERS.length

/**
 * Why a set of teams cannot be stored: a dog in two teams or twice in one, a team with more dogs than
 * there are letters, a team in a series the competition does not have (KOE-1720), or a dog joining a
 * team that may not (KOE-1725). `team` is the team's place in the list, from 0.
 */
type TeamError =
  | { kind: 'notCandidate'; registrationId: string }
  | { kind: 'twice'; registrationId: string }
  | { kind: 'tooMany'; team: number }
  | { kind: 'unknownSeries'; seriesId: string; team: number }

/**
 * Why a competition's settings cannot be stored (KOE-1720): two series with one id, which the teams
 * could not tell apart, or a series without a Finnish name to show.
 */
type TeamCompetitionError = { kind: 'seriesTwice'; seriesId: string } | { kind: 'seriesUnnamed'; seriesId: string }

/** What the team rules read of an event, stored or in the browser: its classes' states for the candidates. */
type TeamOwner = Pick<JsonDogEvent | DogEvent, 'teamCompetition' | 'teams'> & CandidateEvent

/** What the candidate rule reads of an event: each class's state, and the event's for a classless trial. */
interface CandidateEvent {
  classes?: readonly Pick<EventClass, 'class' | 'state'>[]
  state?: EventState
}

/** What the candidate rule reads of an entry: its class, where it is, and whether it was cancelled. */
type CandidateEntry = Pick<JsonRegistration, 'id' | 'cancelled' | 'group' | 'state'> & { class?: string | null }

/** The states of a class whose dogs are picked: from then on its reserve list is the reserve list. */
const PICKED_STATES: ReadonlySet<EventState> = new Set<EventState>([
  'picked',
  'invited',
  'started',
  'ended',
  'completed',
])

/**
 * Whether a dog may join a team (KOE-1725): its entry is finished (`ready`) and not cancelled, and once
 * its class is picked it is one of the dogs picked into it, not a reserve. Before the picking every entry may, as the secretary may
 * assemble the teams early. A classless trial is read by its own state.
 */
export const isTeamCandidate = (event: CandidateEvent, entry: CandidateEntry): boolean => {
  if (entry.cancelled || entry.state !== 'ready') return false
  const state = getEventStateForClass(
    { classes: [...(event.classes ?? [])], state: event.state ?? 'draft' },
    entry.class ?? undefined
  )
  return !PICKED_STATES.has(state) || isStarter(entry)
}

/** A dog's identifier within its team (KOE-1714): the team's number and the dog's letter, "1B". */
const teamMemberCode = (teamNumber: number, place: number): string => `${teamNumber}${MEMBER_LETTERS.charAt(place)}`

/** One dog of a team as its readers show it: its code, its place in the team's list and its entry. */
interface TeamMember<T> {
  code: string
  place: number
  registration: T
}

/**
 * A team's dogs in order, each with its code: the team's number and the dog's letter, the letter its
 * place in `registrationIds` (KOE-1714). The one reading of the rule, for every view of the teams. An
 * id the event's entries do not hold is skipped, and its letter stays taken.
 */
export const teamMembers = <T>(team: EventTeam, number: number, entries: ReadonlyMap<string, T>): TeamMember<T>[] =>
  team.registrationIds.flatMap((id, place) => {
    const registration = entries.get(id)
    return registration === undefined ? [] : [{ code: teamMemberCode(number, place), place, registration }]
  })

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index])

const sameTeam = (a: EventTeam, b: EventTeam) =>
  (a.name ?? '') === (b.name ?? '') &&
  sameIds(a.registrationIds, b.registrationIds) &&
  !!a.runOffWon === !!b.runOffWon &&
  a.seriesId === b.seriesId

/**
 * Whether two sets of teams show differently on the start list: a name, the order of the teams or of a
 * team's dogs, since each changes a heading or a code there (KOE-1715), a run-off won, which changes
 * a placing (KOE-1717), or a team's series, which its rows name and its placing is counted in
 * (KOE-1720). No teams and an empty list are the same, and so are no name and an empty one, and no
 * run-off mark and a false one.
 */
export const teamsDiffer = (
  before: readonly EventTeam[] | null | undefined,
  after: readonly EventTeam[] | null | undefined
): boolean => {
  const a = before ?? []
  const b = after ?? []
  return a.length !== b.length || a.some((team, index) => !sameTeam(team, b[index]))
}

/**
 * Every reason the event save refuses the teams, read on the event as it would be saved, since a change
 * of the series is checked against the teams in them: the shape (each dog once, a letter for each, a
 * series the competition has), and with the event's `entries` whether each dog joining a team may
 * (`isTeamCandidate`, KOE-1725). A dog in a team `before` stays; without the entries, only the shape is
 * read.
 */
export const teamErrors = (
  event: TeamOwner,
  entries?: readonly CandidateEntry[],
  before?: readonly EventTeam[] | null
): TeamError[] => {
  const { teamCompetition, teams } = event
  const tooMany: TeamError[] = []
  const unknownSeries: TeamError[] = []
  const series = new Set(teamCompetition?.series?.map(({ id }) => id))
  const seen = new Set<string>()
  const twice = new Set<string>()

  teams?.forEach((team, index) => {
    if (team.registrationIds.length > MAX_TEAM_MEMBERS) tooMany.push({ kind: 'tooMany', team: index })
    if (team.seriesId !== undefined && !series.has(team.seriesId)) {
      unknownSeries.push({ kind: 'unknownSeries', seriesId: team.seriesId, team: index })
    }
    for (const registrationId of team.registrationIds) (seen.has(registrationId) ? twice : seen).add(registrationId)
  })

  return [
    ...tooMany,
    ...[...twice].map((registrationId): TeamError => ({ kind: 'twice', registrationId })),
    ...unknownSeries,
    ...(entries ? notCandidates(event, teams ?? [], entries, before ?? []) : []),
  ]
}

/**
 * The dogs joining a team that may not (`isTeamCandidate`, KOE-1725), and those the entries do not hold.
 * A dog in a team before stays where the secretary put it, whatever became of its entry since.
 */
const notCandidates = (
  event: TeamOwner,
  teams: readonly EventTeam[],
  entries: readonly CandidateEntry[],
  before: readonly EventTeam[]
): TeamError[] => {
  const kept = new Set(before.flatMap((team) => team.registrationIds))
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  return teams
    .flatMap((team) => team.registrationIds)
    .filter((id) => {
      const entry = byId.get(id)
      return !kept.has(id) && (!entry || !isTeamCandidate(event, entry))
    })
    .map((registrationId) => ({ kind: 'notCandidate', registrationId }))
}

/**
 * Every reason the event save refuses a competition's settings (KOE-1720). Which days count is
 * not refused: a day the trial no longer has is left out of them (KOE-1726).
 */
export const teamCompetitionErrors = (teamCompetition: TeamCompetition | undefined): TeamCompetitionError[] => {
  const seen = new Set<string>()
  const errors: TeamCompetitionError[] = []
  for (const { id, name } of teamCompetition?.series ?? []) {
    if (seen.has(id)) errors.push({ kind: 'seriesTwice', seriesId: id })
    seen.add(id)
    if (!name.fi?.trim()) errors.push({ kind: 'seriesUnnamed', seriesId: id })
  }
  return errors
}

/** Day keys sort as text; the order only lines two sets up for comparing. */
const byText = (x: string, y: string) => x.localeCompare(y)

const sameDays = (a: readonly string[] | undefined, b: readonly string[] | undefined) =>
  sameIds([...(a ?? [])].sort(byText), [...(b ?? [])].sort(byText))

/**
 * Whether two sets of competition settings make a different start list (KOE-1720): only the days
 * counted, which decide a team's points once the standings read them (KOE-1726). A series' name is not
 * on the list, whose rows name the series by id, and a series no team is in ranks no one; the question
 * at entry and the litters are the secretary's.
 */
export const teamCompetitionDiffers = (
  before: TeamCompetition | null | undefined,
  after: TeamCompetition | null | undefined
): boolean => !sameDays(before?.days, after?.days)
