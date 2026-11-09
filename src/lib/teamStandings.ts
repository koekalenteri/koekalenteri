import type { EventTeam, JsonEventResult, JsonRegistration, Registration } from '../types'
import type { FormatOwner } from './event'
import type { TeamDaysOwner } from './team'
import { formatTypeOf } from './event'
import { scoresAtPosts } from './liveFormat'
import { isStarter } from './registration'
import { sharedRanks } from './results'
import { isTeamCountedDay } from './team'

/** What `teamStandings` reads of an entry: whether the dog runs, and what its round came to. */
type StandingEntry = Pick<JsonRegistration | Registration, 'id' | 'cancelled' | 'group'> & {
  eventResult?: Pick<JsonEventResult, 'points' | 'result'>
}

/** A team's points and placing over the trial's counted days in its series, in a team competition (KOE-1717). */
export interface TeamStanding {
  /** The team's place in the event's list, from 0; its number is one more. */
  team: number
  points: number
  placement: number
  /** The team is tied for first in its series, so a run-off task decides (or decided) first place. */
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
 * The teams by series (KOE-1720), each as the teams' places in the list, in the order the series first
 * appear there. The teams in no series are a series of their own, so a competition without series is
 * one.
 */
const bySeries = (teams: readonly EventTeam[]): number[][] => {
  const series = new Map<string | undefined, number[]>()
  teams.forEach(({ seriesId }, team) => {
    const members = series.get(seriesId)
    if (members) members.push(team)
    else series.set(seriesId, [team])
  })
  return [...series.values()]
}

/**
 * The teams' points and placings over the trial (KOE-1717): a team's dogs run in different classes
 * and on different days, and the competition is settled over all of them on the days it counts
 * (KOE-1726), their points summed whatever their class. Each series is ranked on its own, with its own
 * first place and run-off, and the teams in no series among themselves (KOE-1720). A team with no dog
 * running is not ranked. Before any counted dog of a series has a result the series has no standings,
 * rather than every team first on nought. Only a format scored at posts has points; any other has no
 * standings. The one rule for the teams page and the public start list, so the two never disagree; the
 * start list publishes them only once every result they read is out.
 */
export const teamStandings = (
  event: FormatOwner & TeamDaysOwner,
  teams: readonly EventTeam[] | null | undefined,
  entries: readonly StandingEntry[]
): TeamStanding[] => {
  if (!teams?.length || !scoresAtPosts(formatTypeOf(event))) return []

  const members = countedTeamMembers(event, teams, entries)
  return bySeries(teams).flatMap((series) => {
    const running = series.filter((team) => members[team].length)
    if (!running.some((team) => members[team].some(hasResult))) return []

    const totals = running.map((team) => ({
      points: members[team].reduce((sum, dog) => sum + countedPoints(dog), 0),
      team,
    }))
    return rankTeams(teams, totals)
  })
}

/**
 * The teams with the run-off for first place in the series of the team at `index` won by that team, or
 * by none when `won` is false: the mark leaves every other team of the series, so one team of a series
 * holds it (KOE-1717), and the teams of another series keep theirs (KOE-1720).
 */
export const withRunOffWinner = (teams: readonly EventTeam[], index: number, won: boolean): EventTeam[] => {
  const seriesId = teams[index]?.seriesId
  return teams.map((team, at) => {
    if (team.seriesId !== seriesId) return team
    const { runOffWon: _runOffWon, ...rest } = team
    return won && at === index ? { ...rest, runOffWon: true } : rest
  })
}

/**
 * The team moved to the series `seriesId`, or to none (KOE-1720). A run-off won was won among the teams
 * of the series it left, so the mark does not go with it: in the new series no run-off has been decided.
 * A team staying where it is keeps its mark.
 */
export const withTeamSeries = (team: EventTeam, seriesId: string | undefined): EventTeam => {
  if (team.seriesId === seriesId) return team
  const { runOffWon: _runOffWon, seriesId: _seriesId, ...rest } = team
  return seriesId ? { ...rest, seriesId } : rest
}

/**
 * The dogs each team counts, by the team's place in the list: every member that runs, in whichever
 * class (KOE-1717), on a day the competition counts (`isTeamCountedDay`, KOE-1726). A cancelled dog
 * and a reserve run none, and a dog's result is of the day it runs, its group's. What `teamStandings`
 * sums, and what the start list checks is published before it shows the standings.
 */
export const countedTeamMembers = <T extends StandingEntry>(
  event: TeamDaysOwner,
  teams: readonly EventTeam[] | null | undefined,
  entries: readonly T[]
): T[][] => {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const countsDay = isTeamCountedDay(event)
  return (teams ?? []).map((team) =>
    team.registrationIds.flatMap((id) => {
      const entry = byId.get(id)
      return entry && isStarter(entry) && countsDay(entry.group?.date) ? [entry] : []
    })
  )
}
