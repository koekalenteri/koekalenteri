import type { EventTeam, JsonPublicDog, JsonRegistration, TeamCompetition } from '../../types'
import type { CandidateEvent } from '../team'
import { isTeamCandidate, normalizeTeamName, teamNameKey } from '../team'

/** What the suggestions read of an event: its classes' states, its teams and whether it asks for litters. */
type SuggestionEvent = CandidateEvent & {
  teams?: readonly Pick<EventTeam, 'registrationIds'>[] | null
  teamCompetition?: Pick<TeamCompetition, 'litters'> | null
}

/**
 * What the suggestions read of an entry: the candidate rule's fields, the team it named, its parents, and
 * when it was made, a date in the browser and its text in JSON.
 */
type SuggestionEntry = Pick<JsonRegistration, 'id' | 'cancelled' | 'group' | 'state' | 'teamEntry'> & {
  breeder?: { name?: string } | null
  class?: string | null
  createdAt?: Date | string
  dog: Pick<JsonPublicDog, 'dob' | 'sire' | 'dam'>
}

/** A team the page offers the secretary to make: from a name given at entry, or from a litter. */
export interface TeamSuggestion {
  kind: 'name' | 'litter'
  name: string
  /** A dog naming the team marked it its club's or kennel's first team (KOE-1722). */
  primary?: true
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

const enteredAt = ({ createdAt }: SuggestionEntry) => (createdAt ? new Date(createdAt).getTime() : 0)

/** The entries in the order they were made: the list the page reads comes in no order of its own. */
const byEntryTime = (a: SuggestionEntry, b: SuggestionEntry) => enteredAt(a) - enteredAt(b)

/**
 * A dog's litter (KOE-1727): its sire, its dam and its birth day, the parents' names compared as team
 * names are, and the litter's suggested name: the breeder's, as the issue asks (the user's decision
 * 10.11.2026), or the parents' "Isä x Emä" where the entry names no breeder. None where any of the three
 * is not known.
 */
const litterOf = ({ breeder, dog }: LitterEntry): { key: string; name: string } | undefined => {
  const sire = normalizeTeamName(dog.sire?.name ?? '')
  const dam = normalizeTeamName(dog.dam?.name ?? '')
  if (!sire || !dam || !dog.dob) return undefined
  const breederName = normalizeTeamName(breeder?.name ?? '')
  return {
    key: JSON.stringify([teamNameKey(sire), teamNameKey(dam), dog.dob]),
    name: breederName || `${sire} x ${dam}`,
  }
}

/** What a litter is read from: the dog's parents and birth day, and the entry's breeder for its name. */
type LitterEntry = Pick<SuggestionEntry, 'breeder' | 'dog'>

/** Why a dog of a litter team is marked (KOE-1727): of another litter than the team, or of none known. */
interface LitterMismatch {
  kind: 'otherLitter' | 'unknownLitter'
  registrationId: string
}

/**
 * The dogs of a litter team that are not of its litter (KOE-1727): the team's litter is the one most of
 * its dogs are of, the first dog's where two are as many, and a dog of another is marked, as is a dog
 * whose parents or birth day are not known. An id the entries do not hold is skipped. A warning for the
 * secretary only: the save takes a team of mixed litters.
 */
export const litterMismatches = (
  team: Pick<EventTeam, 'registrationIds'>,
  entries: ReadonlyMap<string, LitterEntry>
): LitterMismatch[] => {
  const litters = team.registrationIds.flatMap((registrationId) => {
    const entry = entries.get(registrationId)
    return entry ? [{ key: litterOf(entry)?.key, registrationId }] : []
  })
  const counts = new Map<string, number>()
  for (const { key } of litters) if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  // The first litter to reach the most dogs: a Map keeps the order the dogs came in.
  const most = Math.max(0, ...counts.values())
  const teamLitter = [...counts].find(([, count]) => count === most)?.[0]
  return litters.flatMap(({ key, registrationId }): LitterMismatch[] => {
    if (!key) return [{ kind: 'unknownLitter', registrationId }]
    return key === teamLitter ? [] : [{ kind: 'otherLitter', registrationId }]
  })
}

/**
 * The teams the page suggests to the secretary (KOE-1721, KOE-1727), from the dogs that may join a team
 * and are in none yet (`isTeamCandidate`). First a team for each name given at entry, the spellings
 * that differ only in case and spacing taken as one (`teamNameKey`), named as the first entry made
 * spelled it, its dogs in the order they entered, and marked the first team where any of them marked it
 * so: the secretary, who knows the clubs, keeps or clears the mark on the team (KOE-1722). Then, where
 * the competition asks for litters, a team for each litter of two dogs or more, of the dogs that named
 * no team, named after the first entry's breeder, or the parents ("Isä x Emä") without one. A suggestion
 * is not cut to the most a team may hold; the secretary splits a larger one.
 */
export const teamSuggestions = (
  event: SuggestionEvent,
  registrations: readonly SuggestionEntry[]
): TeamSuggestion[] => {
  const inTeams = new Set((event.teams ?? []).flatMap((team) => team.registrationIds))
  const candidates = registrations
    .filter((entry) => !inTeams.has(entry.id) && isTeamCandidate(event, entry))
    .sort(byEntryTime)

  const teamNames = candidates.flatMap((entry) =>
    entry.teamEntry ? [{ id: entry.id, name: entry.teamEntry.name, primary: !!entry.teamEntry.primary }] : []
  )
  const named = groupBy(teamNames, (entry) => teamNameKey(entry.name))
    .map(
      (group): TeamSuggestion => ({
        kind: 'name',
        name: normalizeTeamName(group[0].name),
        ...(group.some((entry) => entry.primary) ? { primary: true } : {}),
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
