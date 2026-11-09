import type { ClassKey, DayKey, EventTeam, JsonRegistration, RegistrationGroupMove, RegistrationTime } from '../types'
import type { ClassOrderOwner } from './event'
import { classOrder } from './event'
import { GROUP_KEY_RESERVE, getRegistrationGroupKey, isParticipantGroup } from './registration'

/** What the selection reads of an entry: its class, the days it entered, and where it is now. */
export type AssemblyEntry = Pick<JsonRegistration, 'id' | 'cancelled' | 'group'> & {
  class?: ClassKey | null
  dates?: readonly { date: DayKey; time?: RegistrationTime }[]
}

/** A group of a class's day a dog can be moved to: its key, its day and its half. */
export interface ClassGroup {
  date: DayKey
  key: string
  time?: RegistrationTime
}

/**
 * Where a team stands in the selection (KOE-1722): every running member a participant (`selected`),
 * some (`partial`), none (`reserve`), or no member that runs at all (`empty`).
 */
export type TeamSelectionState = 'empty' | 'partial' | 'reserve' | 'selected'

/** The team's members that run: those the entries hold, the cancelled left out. */
const liveMembers = <T extends AssemblyEntry>(team: EventTeam, byId: ReadonlyMap<string, T>): T[] =>
  team.registrationIds.flatMap((id) => {
    const entry = byId.get(id)
    return entry && !entry.cancelled ? [entry] : []
  })

const isParticipant = (entry: AssemblyEntry) => isParticipantGroup(getRegistrationGroupKey(entry))

const byIdOf = <T extends AssemblyEntry>(entries: readonly T[]) => new Map(entries.map((entry) => [entry.id, entry]))

/** Each team's place in the selection, by the team's place in the list (KOE-1722). */
export const teamSelection = (teams: readonly EventTeam[], entries: readonly AssemblyEntry[]): TeamSelectionState[] => {
  const byId = byIdOf(entries)
  return teams.map((team) => {
    const members = liveMembers(team, byId)
    const participants = members.filter(isParticipant).length
    if (!members.length) return 'empty'
    if (participants === members.length) return 'selected'
    return participants ? 'partial' : 'reserve'
  })
}

/** One request's worth of moves: PutRegistrationGroups moves the dogs of one class at a time. */
export interface ClassMoves {
  eventClass: ClassKey
  moves: RegistrationGroupMove[]
}

/**
 * The group a reserve member is moved to: the first group of its class on a day and half it entered,
 * and the class's first group when it entered none the class runs.
 */
const participantGroup = (entry: AssemblyEntry, groups: readonly ClassGroup[]): ClassGroup | undefined =>
  groups.find((group) => entry.dates?.some(({ date, time }) => date === group.date && time === group.time)) ?? groups[0]

const moveOf = (entry: AssemblyEntry, to: 'participants' | 'reserve', groups: readonly ClassGroup[]) => {
  if (to === 'reserve') return isParticipant(entry) ? { group: { key: GROUP_KEY_RESERVE }, id: entry.id } : undefined
  if (isParticipant(entry)) return undefined
  const group = participantGroup(entry, groups)
  return group && { group: { date: group.date, key: group.key, time: group.time }, id: entry.id }
}

/**
 * The moves that send a whole team to the participants or to the reserve list (KOE-1722), one class
 * at a time, in the event's class order (`classOrder`, KOE-674), for PutRegistrationGroups takes the moves of one class. A
 * member already there, and a cancelled one, is not moved. A reserve member goes to the group of a day
 * it entered (`groupsByClass`, its class's groups as the class view lists them).
 */
export const teamGroupMoves = (
  team: EventTeam,
  entries: readonly AssemblyEntry[],
  to: 'participants' | 'reserve',
  groupsByClass: ReadonlyMap<string, readonly ClassGroup[]>,
  event: ClassOrderOwner
): ClassMoves[] => {
  const byClass = new Map<ClassKey, RegistrationGroupMove[]>()
  for (const entry of liveMembers(team, byIdOf(entries))) {
    if (!entry.class) continue
    const move = moveOf(entry, to, groupsByClass.get(entry.class) ?? [])
    if (!move) continue
    byClass.set(entry.class, [...(byClass.get(entry.class) ?? []), move])
  }
  return [...byClass.keys()]
    .sort(classOrder(event))
    .map((eventClass) => ({ eventClass, moves: byClass.get(eventClass) ?? [] }))
}

/** The places still free (KOE-1722): in each class, and in the trial as a whole. */
interface FreePlaces {
  byClass: ReadonlyMap<string, number>
  trial: number
}

/** The places a team still needs: its members not yet participants, by class. */
const placesNeeded = (team: EventTeam, byId: ReadonlyMap<string, AssemblyEntry>): Map<string, number> => {
  const needed = new Map<string, number>()
  for (const entry of liveMembers(team, byId)) {
    if (entry.class && !isParticipant(entry)) needed.set(entry.class, (needed.get(entry.class) ?? 0) + 1)
  }
  return needed
}

const total = (needed: ReadonlyMap<string, number>) => [...needed.values()].reduce((sum, count) => sum + count, 0)

/**
 * The teams drawn for the places still free (KOE-1722), as their places in the list, in the order
 * drawn. A team waits to be drawn while it has a member not yet a participant. The first teams of
 * their clubs or kennels (`primary`) are drawn before the others, and each group in an order set by
 * `random`. A team is taken while its class and the trial have room for every member it still needs;
 * one that does not fit is passed, and the next one tried, so no class is filled past its places.
 */
export const teamDraw = (
  teams: readonly EventTeam[],
  entries: readonly AssemblyEntry[],
  free: FreePlaces,
  random: () => number
): number[] => {
  const byId = byIdOf(entries)
  const waiting = teams.flatMap((team, index) => {
    const needed = placesNeeded(team, byId)
    return total(needed) ? [{ index, key: random(), needed, primary: !!team.primary }] : []
  })
  waiting.sort((a, b) => Number(b.primary) - Number(a.primary) || a.key - b.key)

  const byClass = new Map(free.byClass)
  let trial = free.trial
  const drawn: number[] = []
  for (const { index, needed } of waiting) {
    const fits = total(needed) <= trial && [...needed].every(([key, count]) => count <= (byClass.get(key) ?? 0))
    if (!fits) continue
    for (const [key, count] of needed) byClass.set(key, (byClass.get(key) ?? 0) - count)
    trial -= total(needed)
    drawn.push(index)
  }
  return drawn
}
