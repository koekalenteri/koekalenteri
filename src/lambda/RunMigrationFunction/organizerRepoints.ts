import type { JsonUser, PublicOrganizer, UserRole } from '../../types'
import type { StoredOrganizer } from '../lib/repositories/organizerRepository'

type UserRoles = NonNullable<JsonUser['roles']>

/** What the repoint reads of an event: its id and the organizer it names. */
interface OrganizerReference {
  id: string
  organizer?: Partial<PublicOrganizer>
}

/** An id the organizer table does not hold that no single live organizer accounts for. */
export interface UnmatchedOrganizer {
  /** The events on the id, as read. */
  eventIds: string[]
  /** The names those events give the organizer, as written. */
  names: string[]
  /** How many live organizers carry one of the names. */
  candidates: number
}

/**
 * Where the organizer ids another environment wrote belong in this one (KOE-1580). Ids are minted
 * per environment (GetOrganizersFunction gives a new Kennel Club organizer `nanoid(10)`), so a row
 * copied from another environment names an organizer the table here does not hold.
 */
export interface OrganizerRepoints {
  /** Every id the organizer table holds, soft-deleted rows included: these are left as they are. */
  known: Set<string>
  /** An orphan id, mapped to the one live organizer with its name. */
  targets: Map<string, PublicOrganizer>
  /** The orphan ids left alone: no live organizer, or more than one, has the name. */
  unmatched: Map<string, UnmatchedOrganizer>
}

/** Organizer names compare trimmed and without case, the Finnish way. */
const nameKey = (name: string) => name.trim().toLocaleLowerCase('fi')

/** Appends the value to the list under the key. */
const addTo = <T>(map: Map<string, T[]>, key: string, value: T) => {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

const liveOrganizersByName = (organizers: StoredOrganizer[]) => {
  const byName = new Map<string, StoredOrganizer[]>()
  for (const organizer of organizers) {
    if (!organizer.deletedAt && organizer.name) addTo(byName, nameKey(organizer.name), organizer)
  }
  return byName
}

/** The events on each id the organizer table does not hold. */
const eventsByOrphanId = (events: OrganizerReference[], known: Set<string>) => {
  const byId = new Map<string, OrganizerReference[]>()
  for (const event of events) {
    const id = event.organizer?.id
    if (id && !known.has(id)) addTo(byId, id, event)
  }
  return byId
}

/**
 * Maps each organizer id the events carry and the table does not hold to the live organizer of the
 * same name. An id whose events disagree on the name, or whose name no live organizer or more than
 * one carries, stays unmatched.
 */
export const findOrganizerRepoints = (
  events: OrganizerReference[],
  organizers: StoredOrganizer[]
): OrganizerRepoints => {
  const known = new Set(organizers.map(({ id }) => id))
  const byName = liveOrganizersByName(organizers)
  const targets = new Map<string, PublicOrganizer>()
  const unmatched = new Map<string, UnmatchedOrganizer>()

  for (const [orphanId, orphanEvents] of eventsByOrphanId(events, known)) {
    const names = [...new Set(orphanEvents.map(({ organizer }) => organizer?.name ?? ''))]
    const keys = new Set(names.map(nameKey))
    const candidates = [...keys].flatMap((key) => byName.get(key) ?? [])
    if (keys.size === 1 && candidates.length === 1) {
      targets.set(orphanId, { id: candidates[0].id, name: candidates[0].name })
    } else {
      unmatched.set(orphanId, { candidates: candidates.length, eventIds: orphanEvents.map(({ id }) => id), names })
    }
  }

  return { known, targets, unmatched }
}

const ROLE_STRENGTH: Record<UserRole, number> = { admin: 2, secretary: 1 }

/** The stronger of two roles on the same club: an admin can do whatever a secretary can. */
const strongerRole = (held: UserRole | undefined, moved: UserRole): UserRole =>
  held && ROLE_STRENGTH[held] >= ROLE_STRENGTH[moved] ? held : moved

/**
 * The roles with every role on an orphan id moved onto the live id it maps to, or undefined when
 * none is on one. Both ids name the same club, so a user holding a role on each keeps the stronger:
 * taking the weaker would quietly demote someone who was given more for that club.
 */
export const repointRoles = (
  roles: UserRoles | undefined,
  targets: OrganizerRepoints['targets']
): UserRoles | undefined => {
  if (!roles || !Object.keys(roles).some((id) => targets.has(id))) return undefined

  const moved: UserRoles = {}
  for (const [id, role] of Object.entries(roles)) {
    if (!targets.has(id)) moved[id] = strongerRole(moved[id], role)
  }
  for (const [id, role] of Object.entries(roles)) {
    const target = targets.get(id)
    if (target) moved[target.id] = strongerRole(moved[target.id], role)
  }
  return moved
}

/**
 * The ids of the roles that name no organizer the table holds and that the events give no single
 * live match: left as they are, for someone to look at.
 */
export const unmappableRoleIds = (roles: UserRoles | undefined, repoints: OrganizerRepoints): string[] =>
  Object.keys(roles ?? {}).filter((id) => !repoints.known.has(id) && !repoints.targets.has(id))
