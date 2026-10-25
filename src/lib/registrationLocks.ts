import type { DayKey, OwnerSelection } from '../types'
import type { EventVitals } from './event'
import type { PublicRegistrationFieldName } from './registration'
import { objectsDiffer } from './diff'
import { hasEntryEnded } from './event'
import { getRegistrationOwners, ownerKeyAt, resolveOwnerSelection, withDefaultOwnerSelection } from './registration'
import { withRegistrationDayKeys } from './storedDays'

/**
 * The parts of an entry that close for the participant one by one, by the section of the form that
 * holds them (KOE-1588). `membership` is not a field of its own: it is the `membership` of the owners
 * and of a separate handler, which the people section holds otherwise.
 */
export type ParticipantLockSection = 'dog' | 'entry' | 'membership' | 'payment' | 'people' | 'results'

/** Which sections of the entry the participant may no longer change. */
export type ParticipantFieldLocks = Readonly<Record<ParticipantLockSection, boolean>>

/** Nothing locked: a new entry, and every entry the secretary edits. */
export const NO_PARTICIPANT_FIELD_LOCKS: ParticipantFieldLocks = {
  dog: false,
  entry: false,
  membership: false,
  payment: false,
  people: false,
  results: false,
}

/**
 * The section each field a participant may write belongs to, or `free` for those no section locks:
 * the notes, the payer, the language, the identity and the participant's own responses (which have
 * their own gates in PutRegistration). Every public field is named here, so a new one has to be
 * placed before it can be written (the `satisfies` below and the coverage test).
 */
export const PARTICIPANT_FIELD_SECTIONS = {
  agreeToTerms: 'payment',
  breeder: 'people',
  cancelled: 'free',
  cancelReason: 'free',
  class: 'entry',
  confirmed: 'free',
  creationIdempotencyKey: 'free',
  dates: 'entry',
  dog: 'dog',
  eventId: 'free',
  eventType: 'free',
  handler: 'people',
  invitationRead: 'free',
  language: 'free',
  notes: 'free',
  optionalCosts: 'payment',
  owner: 'people',
  ownerHandles: 'people',
  ownerPays: 'people',
  owners: 'people',
  payer: 'free',
  reserve: 'entry',
  results: 'results',
  selectedCost: 'payment',
} as const satisfies Record<PublicRegistrationFieldName, Exclude<ParticipantLockSection, 'membership'> | 'free'>

/** What the locks are worked out from: the stored entry, never the participant's draft of it. */
type LockFacts = { messagesSent?: { picked?: boolean } | null; paidAt?: unknown } | null | undefined

/**
 * What of an entry the participant may no longer change, by the rule both their form and
 * PutRegistration read (KOE-1588):
 * - the class, the days and the reserve wish once the entry has closed (on the trial days too) or the
 *   dog has been picked;
 * - the dog once picked or paid;
 * - the breeder, the owners and the handler, and the manual results, once picked;
 * - the memberships, the cost and the optional costs, and the terms, once paid.
 *
 * The whole entry closes earlier still (`isRegistrationContentLocked`); the secretary has none of these.
 */
export const getParticipantFieldLocks = (
  event: EventVitals,
  stored: LockFacts,
  now = new Date()
): ParticipantFieldLocks => {
  const picked = Boolean(stored?.messagesSent?.picked)
  const paid = Boolean(stored?.paidAt)
  return {
    dog: picked || paid,
    entry: picked || hasEntryEnded(event, now),
    membership: paid,
    payment: paid,
    people: picked,
    results: picked,
  }
}

const FIELD_SECTIONS: ReadonlyMap<string, ParticipantLockSection | 'free'> = new Map(
  Object.entries(PARTICIPANT_FIELD_SECTIONS)
)

/** Whether a form field (a validation error's field, say) sits in a section that is locked. */
export const isParticipantFieldLocked = (locks: ParticipantFieldLocks, field: string): boolean => {
  const section = FIELD_SECTIONS.get(field)
  return section !== undefined && section !== 'free' && locks[section]
}

type LockedPerson = { key?: string; membership?: boolean }

type DatedResult = { date?: DayKey | '' | null }

/** The parts of an entry the sections read, in the browser's shape or the stored one. */
export type LockableRegistration = {
  agreeToTerms?: boolean
  breeder?: object
  class?: string | null
  dates?: Array<{ date?: DayKey | null; time?: string | null }>
  dog?: { dob?: DayKey | null; results?: DatedResult[] | null }
  handler?: LockedPerson
  optionalCosts?: number[]
  owner?: LockedPerson
  ownerHandles?: OwnerSelection
  ownerPays?: OwnerSelection
  owners?: LockedPerson[]
  reserve?: string
  results?: DatedResult[]
  selectedCost?: string
}

/** Whether the dog is handled by someone besides the owners: an unset selection is the first owner. */
const hasSeparateHandler = (registration: LockableRegistration): boolean =>
  withDefaultOwnerSelection(registration.ownerHandles) === false

/**
 * Which owner a selection names, by position, so a stored key and the position key the form gives a
 * keyless owner are the same choice. A key that names nobody stays itself.
 */
const selectedOwner = (registration: LockableRegistration, selection: OwnerSelection | undefined) => {
  const value = withDefaultOwnerSelection(selection)
  if (typeof value === 'boolean') return value ? 0 : 'separate'
  const index = getRegistrationOwners(registration).findIndex((owner, at) => ownerKeyAt(owner, at) === value)
  return index === -1 ? `stale:${value}` : index
}

const withoutKeyAndMembership = (person: LockedPerson | null | undefined) => {
  if (!person) return person
  const { key: _key, membership: _membership, ...rest } = person
  return rest
}

const sortedDates = (dates: LockableRegistration['dates']) =>
  [...(dates ?? [])].sort((a, b) =>
    `${a.date ?? ''}|${a.time ?? ''}`.localeCompare(`${b.date ?? ''}|${b.time ?? ''}`, 'en')
  )

const dogWithoutResults = (dog: LockableRegistration['dog']) => {
  if (!dog) return dog
  // The official results are the server's: PutRegistration reads them from the dog table.
  const { results: _results, ...rest } = dog
  return rest
}

type ProjectedSection = Exclude<ParticipantLockSection, 'membership'>

/** The sections other than membership, in the order a refusal names the first of them. */
const PROJECTED_SECTIONS: readonly ProjectedSection[] = ['entry', 'dog', 'people', 'results', 'payment']

/** The sections other than membership, as the values they are compared by. */
const SECTION_PROJECTIONS: Record<ProjectedSection, (r: LockableRegistration) => object> = {
  dog: (r) => ({ dog: dogWithoutResults(r.dog) }),
  // The form sorts the days; their order is no change.
  entry: (r) => ({ class: r.class, dates: sortedDates(r.dates), reserve: r.reserve }),
  payment: (r) => ({
    agreeToTerms: r.agreeToTerms,
    optionalCosts: r.optionalCosts ? [...r.optionalCosts].sort((a, b) => a - b) : r.optionalCosts,
    selectedCost: r.selectedCost,
  }),
  // The owner list's key is the form's own (it keys keyless owners by position and writes that back),
  // and the handler is compared only when separate: otherwise it is the handling owner's copy.
  people: (r) => ({
    breeder: r.breeder,
    handler: hasSeparateHandler(r) ? withoutKeyAndMembership(r.handler) : undefined,
    owner: withoutKeyAndMembership(r.owner),
    ownerHandles: selectedOwner(r, r.ownerHandles),
    ownerPays: selectedOwner(r, r.ownerPays),
    owners: r.owners?.map(withoutKeyAndMembership),
  }),
  results: (r) => ({ results: r.results }),
}

/** The membership of whoever handles the dog: the separate handler's or the handling owner's. */
const handlingMembership = (registration: LockableRegistration): boolean => {
  if (hasSeparateHandler(registration)) return Boolean(registration.handler?.membership)
  const owner = resolveOwnerSelection(
    getRegistrationOwners(registration),
    undefined,
    withDefaultOwnerSelection(registration.ownerHandles)
  )
  return Boolean(owner?.membership)
}

const ownerMemberships = (registration: LockableRegistration) =>
  new Map(getRegistrationOwners(registration).map((owner, index) => [ownerKeyAt(owner, index), owner?.membership]))

/**
 * Whether the memberships change: an owner on both sides (by key, a keyless one by position) keeps
 * theirs, an added owner is no member, and a separate handler is a member only as the stored handling
 * person was. Owners and handlers may still come and go while the people section is open.
 */
const membershipChanges = (existing: LockableRegistration, data: LockableRegistration): boolean => {
  const before = ownerMemberships(existing)
  for (const [key, membership] of ownerMemberships(data)) {
    if (Boolean(membership) !== Boolean(before.get(key))) return true
  }
  return hasSeparateHandler(data) && Boolean(data.handler?.membership) !== handlingMembership(existing)
}

/**
 * The first locked section `data` changes from `existing`, or undefined. Days compare by day whatever
 * form either side holds them in, as `hasRegistrationChanges` compares a save. PutRegistration refuses
 * such a change, and the participant's form puts a draft's locked sections back from the stored entry.
 */
export const participantLockedChange = <R extends LockableRegistration>(
  locks: ParticipantFieldLocks,
  existing: R,
  data: R
): ParticipantLockSection | undefined => {
  const before = withRegistrationDayKeys(existing)
  const after = withRegistrationDayKeys(data)
  const changed = PROJECTED_SECTIONS.find(
    (section) =>
      locks[section] && objectsDiffer(SECTION_PROJECTIONS[section](before), SECTION_PROJECTIONS[section](after))
  )
  if (changed) return changed
  if (locks.membership && membershipChanges(before, after)) return 'membership'
  return undefined
}

const LOCKABLE_FIELDS = [...FIELD_SECTIONS.entries()].flatMap(([field, section]) =>
  section === 'free' ? [] : [{ field, section }]
)

/** The draft's memberships put back to the stored ones, by the rule `membershipChanges` reads. */
const withStoredMemberships = <R extends LockableRegistration>(saved: R, draft: R): R => {
  const stored = ownerMemberships(saved)
  const owners = draft.owners?.map((owner, index) => ({
    ...owner,
    membership: Boolean(stored.get(ownerKeyAt(owner, index))),
  }))
  const firstMembership = Boolean(stored.get(ownerKeyAt(getRegistrationOwners(draft)[0], 0)))
  const result: R = { ...draft }
  if (owners) Object.assign(result, { owners })
  if (draft.owner) Object.assign(result, { owner: { ...draft.owner, membership: firstMembership } })
  if (hasSeparateHandler(draft) && draft.handler) {
    Object.assign(result, { handler: { ...draft.handler, membership: handlingMembership(saved) } })
  }
  return result
}

/**
 * The draft with its locked sections put back as the stored entry has them: a lock that arrives while
 * the participant edits (the picking or the payment, by the WebSocket) or a draft kept from before it
 * would otherwise carry a change the server refuses (KOE-1588).
 */
export const withLockedSectionsFrom = <R extends LockableRegistration>(
  saved: R,
  draft: R,
  locks: ParticipantFieldLocks
): R => {
  const result: R = { ...draft }
  for (const { field, section } of LOCKABLE_FIELDS) {
    if (!locks[section]) continue
    if (Object.hasOwn(saved, field)) Object.assign(result, { [field]: structuredClone(Reflect.get(saved, field)) })
    else Reflect.deleteProperty(result, field)
  }
  return locks.membership ? withStoredMemberships(saved, result) : result
}
