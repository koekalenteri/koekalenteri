import type { DayKey, JsonPublicDogEvent, OwnerSelection, PublicDogEvent } from '../types'
import type { EventVitals } from './event'
import type { PublicRegistrationFieldName } from './registration'
import { objectsDiffer } from './diff'
import { hasEntryEnded } from './event'
import { PRIORITY_MEMBER, priorityValuesToPriority, RESTRICTION } from './priority'
import { getHandlingPerson, getRegistrationOwners, isMember, ownerKeyAt, resolveOwnerSelection } from './registration'
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

/** Why a section is locked: the payment, the place in the trial, or the close of entry. */
export type ParticipantLockReason = 'entryClosed' | 'paid' | 'picked'

const LOCK_REASONS: Record<ParticipantLockSection, (picked: boolean) => ParticipantLockReason> = {
  dog: (picked) => (picked ? 'picked' : 'paid'),
  entry: (picked) => (picked ? 'picked' : 'entryClosed'),
  membership: () => 'paid',
  payment: () => 'paid',
  people: () => 'picked',
  results: () => 'picked',
}

/** Why a locked section is locked, by the same facts `getParticipantFieldLocks` reads, for telling the participant. */
export const getParticipantLockReason = (section: ParticipantLockSection, stored: LockFacts): ParticipantLockReason =>
  LOCK_REASONS[section](Boolean(stored?.messagesSent?.picked))

/**
 * Whether the entry restriction (KOE-525) is out of the participant's hands: every section that could
 * still meet it is locked. A breed is met through the dog. A members-only restriction is met through
 * the memberships, and once they are locked the entry can neither gain nor lose being a member's: no
 * claim flips, a person added claims none, and removing the last member is refused. With those locked
 * the participant has nothing left to change, so neither their form nor PutRegistration holds the rest
 * of the entry back on it (KOE-1588). The secretary decides it then.
 */
export const isEntryRestrictionLocked = (
  event: Partial<Pick<PublicDogEvent | JsonPublicDogEvent, 'restrictions'>>,
  locks: ParticipantFieldLocks
): boolean =>
  priorityValuesToPriority(event.restrictions, RESTRICTION).every((restriction) =>
    restriction.value === PRIORITY_MEMBER ? locks.membership : locks.dog
  )

const FIELD_SECTIONS: ReadonlyMap<string, ParticipantLockSection | 'free'> = new Map(
  Object.entries(PARTICIPANT_FIELD_SECTIONS)
)

/** Whether a form field (a validation error's field, say) sits in a section that is locked. */
export const isParticipantFieldLocked = (locks: ParticipantFieldLocks, field: string): boolean => {
  const section = FIELD_SECTIONS.get(field)
  return section !== undefined && section !== 'free' && locks[section]
}

type LockedPerson = { email?: string; key?: string; membership?: boolean; name?: string }

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

/**
 * Who a selection names, as `resolveOwnerSelection` reads it for the handling and the paying person:
 * an owner by their position in the list, or `apart` for the separate person when it names no owner
 * (unset, `false`, or a key no owner has). So the lock and every reader of the handling person agree.
 */
const selectedOwner = (registration: LockableRegistration, selection: OwnerSelection | undefined) => {
  const resolved = resolveOwnerSelection(registration.owners, registration.owner, selection)
  return resolved ? getRegistrationOwners(registration).indexOf(resolved) : 'apart'
}

/** Whether the separate handler is the handling person (`getHandlingPerson`), rather than an owner. */
const handlerHandles = (registration: LockableRegistration): boolean =>
  selectedOwner(registration, registration.ownerHandles) === 'apart'

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
  // The owners as `getRegistrationOwners` reads them: the list, or a row's single `owner` before it
  // (which the form turns into a list of one). `owner` is compared besides, as the start list and the
  // emails read it; the form leaves it as it is when it writes the list. The list's key is the form's
  // own (it keys keyless owners by position and writes that back). The handler is compared when they
  // are the handling person; otherwise the server copies the handling owner there.
  people: (r) => ({
    breeder: r.breeder,
    handler: handlerHandles(r) ? withoutKeyAndMembership(r.handler) : undefined,
    owner: withoutKeyAndMembership(r.owner),
    ownerHandles: selectedOwner(r, r.ownerHandles),
    ownerPays: selectedOwner(r, r.ownerPays),
    owners: getRegistrationOwners(r).map(withoutKeyAndMembership),
  }),
  results: (r) => ({ results: r.results }),
}

/** A membership claim as `isMember` reads one, from a person that may not say. */
const claim = (person: LockedPerson | undefined) => person && { membership: Boolean(person.membership) }

/** Whether the entry is a member's, asked of `isMember` itself: the rule the price and the restriction read. */
const isMemberEntry = (registration: LockableRegistration): boolean =>
  isMember({
    handler: claim(registration.handler),
    owner: claim(registration.owner),
    ownerHandles: registration.ownerHandles,
    owners: registration.owners?.map((owner) => ({ membership: Boolean(owner.membership) })),
  })

/** Whether the handler is the one `isMember` reads a membership from, an unset selection included. */
const handlerCounts = (registration: LockableRegistration): boolean =>
  isMember({ handler: { membership: true }, ownerHandles: registration.ownerHandles })

const textOf = (value: string | undefined) => (value ?? '').trim().toLowerCase()

/** Whether two people are the same person by what they are called and reached at. */
const samePerson = (a: LockedPerson | undefined, b: LockedPerson | undefined): boolean =>
  Boolean(a && b) && textOf(a?.name) === textOf(b?.name) && textOf(a?.email) === textOf(b?.email)

/**
 * The stored owner each sent owner is, each stored owner at most once. By the key first, which the form
 * gives a keyless stored owner by position and writes back with the first change of the owners. A
 * keyless sent owner is then found by name and address among the stored owners that are keyless too,
 * the one in the same position first, so a row the form has not keyed is matched whatever position a
 * request moved an owner to, and two stored owners alike match one each. A stored owner with a key of
 * their own is that key's alone: a keyless owner who shares a name and an address with them is new.
 */
const storedOwnersOf = (
  storedOwners: readonly LockedPerson[],
  sentOwners: readonly LockedPerson[]
): (LockedPerson | undefined)[] => {
  const taken = new Set<number>()
  const take = (index: number) => {
    if (index === -1) return undefined
    taken.add(index)
    return storedOwners[index]
  }
  const byKey = sentOwners.map((owner) =>
    owner.key
      ? take(storedOwners.findIndex((stored, index) => !taken.has(index) && ownerKeyAt(stored, index) === owner.key))
      : undefined
  )
  return sentOwners.map((owner, position) => {
    if (byKey[position] || owner.key) return byKey[position]
    const alike = (index: number) =>
      !taken.has(index) && !storedOwners[index]?.key && samePerson(storedOwners[index], owner)
    return take(alike(position) ? position : storedOwners.findIndex((_stored, index) => alike(index)))
  })
}

/** The membership each sent owner may claim: their stored one, or none for an owner added since. */
const ownerClaimsFrom = (storedOwners: readonly LockedPerson[], sentOwners: readonly LockedPerson[]): boolean[] =>
  storedOwnersOf(storedOwners, sentOwners).map((stored) => Boolean(stored?.membership))

/**
 * The membership a handler who counts may claim. The handler's place is the person: a handler who
 * counted before keeps the stored claim whatever is corrected of their name or address. A handler who
 * starts counting, as when the owner who handled stops, may claim the stored handling person's
 * membership only when named as that person, and none otherwise.
 */
const handlerMembershipFrom = (existing: LockableRegistration, handler: LockedPerson | undefined): boolean => {
  if (handlerCounts(existing)) return Boolean(existing.handler?.membership)
  const handling = getHandlingPerson(existing)
  return samePerson(handling, handler) && Boolean(handling?.membership)
}

/**
 * Whether the membership claims change: a person on both sides keeps theirs, a person added since
 * claims none, and people may leave as long as the entry stays a member's (`isMember`), which the price
 * and a members-only restriction read. Who handles may still change while the people are open, and with
 * it the priority (the user's decision, 25.10.2026); only the claims are held.
 */
const membershipChanges = (existing: LockableRegistration, data: LockableRegistration): boolean => {
  const sentOwners = getRegistrationOwners(data)
  const claims = ownerClaimsFrom(getRegistrationOwners(existing), sentOwners)
  const ownerClaimChanges = sentOwners.some((owner, index) => Boolean(owner?.membership) !== claims[index])
  const handlerClaimChanges =
    handlerCounts(data) && Boolean(data.handler?.membership) !== handlerMembershipFrom(existing, data.handler)
  return ownerClaimChanges || handlerClaimChanges || (isMemberEntry(existing) && !isMemberEntry(data))
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

/** The people as the stored entry has them, for a draft whose memberships cannot be put back alone. */
const PEOPLE_FIELDS = ['handler', 'owner', 'ownerHandles', 'ownerPays', 'owners'] as const

/**
 * The draft's membership claims put back by the rule `membershipChanges` reads: each person their
 * stored claim, a person added since none. A draft that removed the last member gets the stored people
 * back whole, so what comes back is never a change the server refuses.
 */
const withStoredMemberships = <R extends LockableRegistration>(saved: R, draft: R): R => {
  const storedOwners = getRegistrationOwners(saved)
  const result: R = { ...draft }
  const ownerClaims = draft.owners ? ownerClaimsFrom(storedOwners, draft.owners) : []
  if (draft.owners) {
    const owners = draft.owners.map((owner, index) => ({ ...owner, membership: ownerClaims[index] }))
    Object.assign(result, { owners })
  }
  if (draft.owner) {
    // The single `owner` mirrors the list's first owner and takes their claim; a row without a list is
    // matched by itself.
    const [membership] = ownerClaims.length ? ownerClaims : ownerClaimsFrom(storedOwners, [draft.owner])
    Object.assign(result, { owner: { ...draft.owner, membership } })
  }
  if (draft.handler && handlerCounts(draft)) {
    const membership = handlerMembershipFrom(saved, draft.handler)
    Object.assign(result, { handler: { ...draft.handler, membership } })
  }
  if (!membershipChanges(saved, result)) return result
  for (const field of PEOPLE_FIELDS) {
    if (Object.hasOwn(saved, field)) Object.assign(result, { [field]: structuredClone(saved[field]) })
    else Reflect.deleteProperty(result, field)
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
