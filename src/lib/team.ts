import type { DogEvent, EventTeam, JsonDogEvent, TeamCompetition, TeamEntry } from '../types'
import { isObject } from './utils'

/** The letters a team's dogs are told apart by: so many dogs a team can hold (KOE-1714). */
const MEMBER_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const MAX_TEAM_MEMBERS = MEMBER_LETTERS.length

/**
 * Why a set of teams cannot be stored: a dog in two teams or twice in one, a team with more dogs than
 * there are letters, or a team in a series the competition does not have (KOE-1720). `team` is the
 * team's place in the list, from 0.
 */
type TeamError =
  | { kind: 'twice'; registrationId: string }
  | { kind: 'tooMany'; team: number }
  | { kind: 'unknownSeries'; seriesId: string; team: number }

/**
 * Why a competition's settings cannot be stored (KOE-1720): two series with one id, which the teams
 * could not tell apart, or a series without a Finnish name to show.
 */
type TeamCompetitionError = { kind: 'seriesTwice'; seriesId: string } | { kind: 'seriesUnnamed'; seriesId: string }

/** What the team rules read of an event, stored or in the browser. */
type TeamOwner = Pick<JsonDogEvent | DogEvent, 'teamCompetition' | 'teams'>

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
 * of the series is checked against the teams in them. Only the shape is checked: which dogs can be
 * picked is the teams page's business, and the readers skip an id the event's registrations do not hold.
 */
export const teamErrors = ({ teamCompetition, teams }: TeamOwner): TeamError[] => {
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
  ]
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

/** A team's name as it is stored: trimmed, with one space between its words (KOE-1721). */
export const normalizeTeamName = (name: string): string => name.replaceAll(/\s+/gu, ' ').trim()

/** Why an entry's team cannot be stored: no question asked, no name, or not a team's shape (KOE-1721). */
type EntryTeamError = 'invalid' | 'noName' | 'notAsked'

const isTeamEntry = (value: unknown): value is TeamEntry =>
  isObject(value) && typeof value.name === 'string' && (value.primary === undefined || value.primary === true)

/**
 * Why the save refuses the team an entry names (KOE-1721), or nothing. A team is a name, and maybe the
 * first-team mark; one is written only where the event asks for it (`teamCompetition.askAtEntry`), and
 * then with a name. The team stored before is kept as it is, so an event that stops asking leaves the
 * entries that named one their own to save.
 */
export const entryTeamError = (
  event: Pick<JsonDogEvent | DogEvent, 'teamCompetition'>,
  teamEntry: unknown,
  stored?: TeamEntry | null
): EntryTeamError | undefined => {
  if (teamEntry === undefined || teamEntry === null) return undefined
  if (!isTeamEntry(teamEntry)) return 'invalid'
  const name = normalizeTeamName(teamEntry.name)
  if (stored && name === normalizeTeamName(stored.name) && teamEntry.primary === stored.primary) return undefined
  if (event.teamCompetition?.askAtEntry !== true) return 'notAsked'
  return name ? undefined : 'noName'
}
