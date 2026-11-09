import type { EventTeam, JsonEventResult, JsonRegistration, Registration } from '../types'
import type { FormatOwner } from './event'
import { formatTypeOf } from './event'
import { scoresAtPosts } from './liveFormat'
import { isStarter } from './registration'
import { sharedRanks } from './results'

/** The letters a team's dogs are told apart by: so many dogs a team can hold (KOE-1714). */
const MEMBER_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const MAX_TEAM_MEMBERS = MEMBER_LETTERS.length

/**
 * Why a set of teams cannot be stored: a dog in two teams or twice in one, or a team with more dogs
 * than there are letters. `team` is the team's place in the list, from 0.
 */
type TeamError = { kind: 'twice'; registrationId: string } | { kind: 'tooMany'; team: number }

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
  (a.name ?? '') === (b.name ?? '') && sameIds(a.registrationIds, b.registrationIds) && !!a.runOffWon === !!b.runOffWon

/**
 * Whether two sets of teams show differently on the start list: a name, the order of the teams or of a
 * team's dogs, since each changes a heading or a code there (KOE-1715), or a run-off won, which changes
 * a placing (KOE-1717). No teams and an empty list are the same, and so are no name and an empty one,
 * and no run-off mark and a false one.
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
 * Every reason the event save refuses the teams. Only the shape is checked: which dogs can be picked is
 * the teams page's business, and the readers skip an id the event's registrations do not hold.
 */
export const teamErrors = (teams: readonly EventTeam[] | null | undefined): TeamError[] => {
  const tooMany: TeamError[] = []
  const seen = new Set<string>()
  const twice = new Set<string>()

  teams?.forEach((team, index) => {
    if (team.registrationIds.length > MAX_TEAM_MEMBERS) tooMany.push({ kind: 'tooMany', team: index })
    for (const registrationId of team.registrationIds) (seen.has(registrationId) ? twice : seen).add(registrationId)
  })

  return [...tooMany, ...[...twice].map((registrationId): TeamError => ({ kind: 'twice', registrationId }))]
}

/** What `teamStandings` reads of an entry: whether the dog runs, and what its round came to. */
type StandingEntry = Pick<JsonRegistration | Registration, 'id' | 'cancelled' | 'group'> & {
  eventResult?: Pick<JsonEventResult, 'points' | 'result'>
}

/** A team's points and placing over the whole trial, in a team competition (KOE-1717). */
export interface TeamStanding {
  /** The team's place in the event's list, from 0; its number is one more. */
  team: number
  points: number
  placement: number
  /** The team is tied for first, so a run-off task decides (or decided) first place. */
  runOff?: true
}

/**
 * The points a member brings its team: what its round earned once the round has a result, a nought or a
 * dash included, since an early end keeps its points (KOE-1669). A round without a result yet (absent,
 * not entered or half-entered) brings none, as its own row publishes none.
 */
const countedPoints = (entry: StandingEntry): number => (hasResult(entry) ? (entry.eventResult?.points ?? 0) : 0)

const hasResult = ({ eventResult }: StandingEntry): boolean => !!eventResult?.result

/**
 * The standings from each team's points, best first. Teams level on points share a placing (1, 2, 2, 4),
 * except a tie for first: the tied team that won the run-off takes first place alone, and the others
 * share the next one. Two tied teams marked as its winner is the first one in the list winning it.
 * Until one is marked, the tied teams share first place.
 */
const rankTeams = (
  teams: readonly EventTeam[],
  totals: readonly { points: number; team: number }[]
): TeamStanding[] => {
  const ranked = [...totals].sort((a, b) => b.points - a.points || a.team - b.team)
  const top = ranked[0].points
  const first = ranked.filter(({ points }) => points === top)
  const runOff = first.length > 1
  const winner = runOff ? first.find(({ team }) => teams[team].runOffWon) : undefined
  const ordered = winner ? [winner, ...ranked.filter((entry) => entry !== winner)] : ranked
  const ranks = sharedRanks(ordered, (previous, entry) => previous !== winner && previous.points === entry.points)

  return ordered.map(({ points, team }, index) => ({
    placement: ranks[index],
    points,
    ...(runOff && points === top ? { runOff: true as const } : {}),
    team,
  }))
}

/**
 * The teams' points and placings over the whole trial (KOE-1717): a team's dogs run in different
 * classes and on different days, and the competition is settled over all of them, their points summed
 * whatever their class. A team with no dog running is not ranked. Before any counted dog has a result
 * there are no standings, rather than every team first on nought. Only a format scored at posts has
 * points; any other has no standings. The one rule for the teams page and the public start list, so the
 * two never disagree; the start list publishes them only once every result they read is out.
 */
export const teamStandings = (
  event: FormatOwner,
  teams: readonly EventTeam[] | null | undefined,
  entries: readonly StandingEntry[]
): TeamStanding[] => {
  if (!teams?.length || !scoresAtPosts(formatTypeOf(event))) return []

  const members = countedTeamMembers(teams, entries)
  if (!members.some((dogs) => dogs.some(hasResult))) return []

  const totals = members.flatMap((dogs, team) =>
    dogs.length ? [{ points: dogs.reduce((sum, dog) => sum + countedPoints(dog), 0), team }] : []
  )
  return rankTeams(teams, totals)
}

/**
 * The teams with the run-off for first place won by the team at `index`, or by none when `won` is false:
 * the mark leaves every other team, so one team holds it (KOE-1717).
 */
export const withRunOffWinner = (teams: readonly EventTeam[], index: number, won: boolean): EventTeam[] =>
  teams.map((team, at) => {
    const { runOffWon: _runOffWon, ...rest } = team
    return won && at === index ? { ...rest, runOffWon: true } : rest
  })

/**
 * The dogs each team counts, by the team's place in the list: every member that runs, on whichever day
 * and in whichever class (KOE-1717). A cancelled dog and a reserve run none. What `teamStandings` sums,
 * and what the start list checks is published before it shows the standings.
 */
export const countedTeamMembers = <T extends StandingEntry>(
  teams: readonly EventTeam[] | null | undefined,
  entries: readonly T[]
): T[][] => {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  return (teams ?? []).map((team) =>
    team.registrationIds.flatMap((id) => {
      const entry = byId.get(id)
      return entry && isStarter(entry) ? [entry] : []
    })
  )
}
