import type { EventTeam, JsonPublicDog, JsonRegistration, TeamCompetition } from '../../types'
import type { CandidateEvent } from '../team'
import { isTeamCandidate, normalizeTeamName, teamNameKey } from '../team'

/** What the suggestions read of an event: its classes' states, its teams and whether it asks for litters. */
type SuggestionEvent = CandidateEvent & {
  teams?: readonly Pick<EventTeam, 'registrationIds'>[] | null
  teamCompetition?: Pick<TeamCompetition, 'litters'> | null
}

/** What the suggestions read of an entry: the candidate rule's fields, the team it named and its parents. */
type SuggestionEntry = Pick<JsonRegistration, 'id' | 'cancelled' | 'group' | 'state' | 'teamEntry'> & {
  class?: string | null
  dog: Pick<JsonPublicDog, 'dob' | 'sire' | 'dam'>
}

/** A team the page offers the secretary to make: from a name given at entry, or from a litter. */
interface TeamSuggestion {
  kind: 'name' | 'litter'
  name: string
  registrationIds: string[]
}

/** The entries grouped by `keyOf`, in the order they came. */
const groupBy = <T>(entries: readonly T[], keyOf: (entry: T) => string): T[][] => {
  const groups = new Map<string, T[]>()
  for (const entry of entries) {
    const key = keyOf(entry)
    const group = groups.get(key)
    if (group) group.push(entry)
    else groups.set(key, [entry])
  }
  return [...groups.values()]
}

const byName = (a: TeamSuggestion, b: TeamSuggestion) => a.name.localeCompare(b.name, 'fi')

/**
 * A dog's litter (KOE-1727): its sire, its dam and its birth day, the parents' names compared as team
 * names are, and the litter's suggested name from them, "Isä x Emä". None where any of the three is not
 * known. The breeder's name is never part of it.
 */
const litterOf = ({ dog }: SuggestionEntry): { key: string; name: string } | undefined => {
  const sire = normalizeTeamName(dog.sire?.name ?? '')
  const dam = normalizeTeamName(dog.dam?.name ?? '')
  if (!sire || !dam || !dog.dob) return undefined
  return { key: JSON.stringify([teamNameKey(sire), teamNameKey(dam), dog.dob]), name: `${sire} x ${dam}` }
}

/**
 * The teams the page suggests to the secretary (KOE-1721, KOE-1727), from the dogs that may join a team
 * and are in none yet (`isTeamCandidate`). First a team for each name given at entry, the spellings
 * that differ only in case and spacing taken as one (`teamNameKey`), named as its first entry spelled
 * it. Then, where the competition asks for litters, a team for each litter of two dogs or more, of the
 * dogs that named no team, named after the parents ("Isä x Emä"). A suggestion is not cut to the most
 * a team may hold; the secretary splits a larger one. The breeder's name is never part of one.
 */
export const teamSuggestions = (
  event: SuggestionEvent,
  registrations: readonly SuggestionEntry[]
): TeamSuggestion[] => {
  const inTeams = new Set((event.teams ?? []).flatMap((team) => team.registrationIds))
  const candidates = registrations.filter((entry) => !inTeams.has(entry.id) && isTeamCandidate(event, entry))

  const teamNames = candidates.flatMap((entry) =>
    entry.teamEntry ? [{ id: entry.id, name: entry.teamEntry.name }] : []
  )
  const named = groupBy(teamNames, (entry) => teamNameKey(entry.name))
    .map(
      (group): TeamSuggestion => ({
        kind: 'name',
        name: normalizeTeamName(group[0].name),
        registrationIds: group.map((entry) => entry.id),
      })
    )
    .sort(byName)
  if (!event.teamCompetition?.litters) return named

  const litters = groupBy(
    candidates.flatMap((entry) => {
      const litter = entry.teamEntry ? undefined : litterOf(entry)
      return litter ? [{ id: entry.id, ...litter }] : []
    }),
    (dog) => dog.key
  )
    .filter((group) => group.length > 1)
    .map(
      (group): TeamSuggestion => ({
        kind: 'litter',
        name: group[0].name,
        registrationIds: group.map((dog) => dog.id),
      })
    )
    .sort(byName)
  return [...named, ...litters]
}
