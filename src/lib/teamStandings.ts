import type { EventTeam, JsonEventResult, JsonRegistration, Registration } from '../types'
import type { FormatOwner } from './event'
import { formatTypeOf } from './event'
import { scoresAtPosts } from './liveFormat'
import { isStarter } from './registration'
import { sharedRanks } from './results'

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
