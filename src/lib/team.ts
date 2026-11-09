import type { EventTeam } from '../types'

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
