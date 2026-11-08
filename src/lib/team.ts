import type { EventTeam } from '../types'

/** The letters a team's dogs are told apart by: so many dogs a team can hold (KOE-1714). */
const MEMBER_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const MAX_TEAM_MEMBERS = MEMBER_LETTERS.length

/**
 * Why a set of teams cannot be stored: a dog in two teams or twice in one, or a team with more dogs
 * than there are letters. `team` is the team's place in the list, from 0.
 */
export type TeamError = { kind: 'twice'; registrationId: string } | { kind: 'tooMany'; team: number }

/** A dog's identifier within its team (KOE-1714): the team's number and the dog's letter, "1B". */
export const teamMemberCode = (teamNumber: number, place: number): string =>
  `${teamNumber}${MEMBER_LETTERS.charAt(place)}`

/**
 * Every reason the teams cannot be stored, the same on the teams page and in the event save. Only the
 * shape is checked: which dogs the page offers is the page's business, and the readers skip an id the
 * event's registrations do not hold.
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
