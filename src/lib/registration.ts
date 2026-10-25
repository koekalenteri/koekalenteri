import type { TFunction } from 'i18next'
import type {
  ConfirmedEvent,
  CustomCost,
  DayKey,
  EmailTemplateId,
  EventState,
  GroupDate,
  JsonConfirmedEvent,
  JsonPublicDogEvent,
  JsonRegistration,
  JsonRegistrationGroup,
  MinimalEventForCost,
  MinimalRegistrationForCost,
  MinimalRegistrationForMembership,
  OwnerSelection,
  Patch,
  PaymentBalance,
  PaymentPicture,
  PublicDogEvent,
  RefundField,
  Registration,
  RegistrationClass,
  RegistrationOwner,
  RegistrationPerson,
  RegistrationPlacement,
  RegistrationRefundAmounts,
  RegistrationTemplateContext,
  RegistrationTime,
} from '../types'
import type { AuditActor } from './audit'
import type { EventVitals } from './event'
import { nanoid } from 'nanoid'
import { emptyBreeder, emptyDog, emptyPerson } from './data'
import { addDays, calendarDayOf, dayOf, TIME_ZONE } from './day'
import {
  getEventStateForClass,
  groupKeyOf,
  hasSharedReserveList,
  isEntryClosed,
  isEntryEditingClosed,
  localizedEventDescription,
  localizedEventName,
  storedDayKey,
} from './event'
import { formatMoney, getNetPaidAmount } from './money'
import { PRIORITY_INVITED, PRIORITY_MEMBER, priorityValuesToPriority, RESTRICTION } from './priority'
import { isDefined } from './typeGuards'
import { isObject, unique } from './utils'

export const GROUP_KEY_CANCELLED = 'cancelled'
export const GROUP_KEY_RESERVE = 'reserve'

/**
 * How many of one event's registration rows are written at once when a request touches many: a
 * start list publish, a draw, a move that renumbers a class. The rows of one event share a DynamoDB
 * partition (the table's hash key is eventId), whose write rate is capped whatever the table's
 * billing mode, and each write audits and broadcasts in turn. Ten keeps a class's worth of writes
 * well under that cap and well under the SDK's socket pool; a limit here, not an implicit one there.
 */
export const REGISTRATION_WRITE_CONCURRENCY = 10

/** Key of the sole owner when there is no sibling to disambiguate from (fresh drafts, legacy records). */
export const DEFAULT_OWNER_KEY = 'owner-1'

/**
 * Owner list `key` as the form assigns it: a stored key is kept, while keyless (legacy/API-written)
 * entries get a deterministic position-based key. The form derives keys the same way, so the same
 * row resolves to the same key whether it came from storage or from an in-progress edit.
 */
export const ownerKeyAt = (owner: unknown, index: number): string =>
  (owner as { key?: string } | undefined)?.key ?? `owner-${index + 1}`

/** Owners of a registration: the `owners` list when present, falling back to the legacy single `owner`. */
export const getRegistrationOwners = <O, L>(registration?: { owners?: O[]; owner?: L }): (O | L)[] => {
  if (registration?.owners?.length) return registration.owners
  return registration?.owner ? [registration.owner] : []
}

/** Display-formats a registration's owner names as a single comma-separated string. */
export const formatOwnerNames = (registration?: { owners?: { name?: string }[]; owner?: { name?: string } }): string =>
  getRegistrationOwners(registration)
    .map((owner) => owner?.name)
    .filter(Boolean)
    .join(', ')

export const createRegistrationDraft = (mode: 'admin' | 'participant'): Registration => ({
  agreeToTerms: false,
  breeder: { ...emptyBreeder },
  createdAt: new Date(),
  createdBy: 'anonymous',
  creationIdempotencyKey: nanoid(32),
  dates: [],
  dog: { ...emptyDog },
  eventId: '',
  eventType: '',
  handler: { ...emptyPerson },
  id: '',
  language: 'fi',
  modifiedAt: new Date(),
  modifiedBy: 'anonymous',
  notes: '',
  owner: { ...emptyPerson },
  ownerHandles: true,
  ownerPays: true,
  owners: [{ ...emptyPerson, key: DEFAULT_OWNER_KEY }],
  payer: { ...emptyPerson },
  qualifyingResults: [],
  reserve: 'DAY',
  ...(mode === 'participant' ? ({ qualifies: false, state: 'creating' } satisfies Partial<Registration>) : {}),
})

/**
 * Whether a body the server has stamped with its own fields carries everything a stored
 * registration has. The wire schema leaves every field optional, because the same body shape serves
 * an edit and a patch; this is where a new registration is held to the full shape.
 */
export const isCompleteRegistration = (registration: Patch<JsonRegistration>): registration is JsonRegistration =>
  typeof registration.agreeToTerms === 'boolean' &&
  isObject(registration.breeder) &&
  typeof registration.createdAt === 'string' &&
  typeof registration.createdBy === 'string' &&
  Array.isArray(registration.dates) &&
  isObject(registration.dog) &&
  typeof registration.eventId === 'string' &&
  typeof registration.eventType === 'string' &&
  typeof registration.id === 'string' &&
  (registration.language === 'fi' || registration.language === 'en') &&
  typeof registration.modifiedAt === 'string' &&
  typeof registration.modifiedBy === 'string' &&
  typeof registration.notes === 'string' &&
  Array.isArray(registration.qualifyingResults) &&
  typeof registration.reserve === 'string'

type PublicRegistrationField = keyof JsonRegistration

export const PUBLIC_REGISTRATION_FIELDS: ReadonlyArray<PublicRegistrationField> = [
  'agreeToTerms',
  'breeder',
  'cancelReason',
  'cancelled',
  'class',
  'creationIdempotencyKey',
  'dates',
  'dog',
  'eventId',
  'eventType',
  'confirmed',
  'handler',
  'invitationRead',
  'language',
  'notes',
  'optionalCosts',
  'owner',
  'ownerHandles',
  'ownerPays',
  'owners',
  'payer',
  'reserve',
  'results',
  'selectedCost',
]

/**
 * A registration's money and its payments' bookkeeping. Written only by the payment and refund
 * transactions in the lambdas' `transactionRepository` (and the creation mark by
 * `registrationRepository`), never from a registration form: a secretary's save keeps what is
 * stored, and the admin client leaves these out of the operations it sends (KOE-1531).
 */
export const REGISTRATION_MONEY_FIELDS = [
  'openPayments',
  'openRefunds',
  'paidAmount',
  'paidAt',
  'paymentCreationAt',
  'paymentCreationStamp',
  'paymentStatus',
  'refundAmount',
  'refundAt',
  'refundCreationAt',
  'refundCreationStamp',
  'refundHandlingCost',
  'refundStatus',
] as const satisfies ReadonlyArray<keyof JsonRegistration>

type RegistrationMoneyField = (typeof REGISTRATION_MONEY_FIELDS)[number]

const withoutFields = <F extends string, T extends Partial<Record<F, unknown>>>(
  registration: T,
  fields: ReadonlyArray<F>
): T => {
  const result = { ...registration }
  for (const field of fields) delete result[field]
  return result
}

/** A copy of the registration without its money fields (`REGISTRATION_MONEY_FIELDS`). */
export const withoutRegistrationMoney = <T extends Partial<Record<RegistrationMoneyField, unknown>>>(
  registration: T
): T => withoutFields(registration, REGISTRATION_MONEY_FIELDS)

/**
 * What a participant's cancellation, confirmation and reading of an invitation write. The rest of the
 * public fields are what the entry says, which closes earlier (`isRegistrationContentLocked`, KOE-1584).
 */
const PARTICIPANT_RESPONSE_FIELDS = [
  'cancelReason',
  'cancelled',
  'confirmed',
  'invitationAttachmentRead',
  'invitationRead',
] as const satisfies ReadonlyArray<keyof JsonRegistration>

type ParticipantResponseField = (typeof PARTICIPANT_RESPONSE_FIELDS)[number]

/** A copy of the registration without what a participant's response writes (`PARTICIPANT_RESPONSE_FIELDS`). */
export const withoutParticipantResponses = <T extends Partial<Record<ParticipantResponseField, unknown>>>(
  registration: T
): T => withoutFields(registration, PARTICIPANT_RESPONSE_FIELDS)

/** The durable and leased state of one creation attempt of a registration. */
export const NEW_REGISTRATION_WORKFLOW_FIELDS = [
  'newRegistrationAuditAt',
  'newRegistrationEmailSentAt',
  'newRegistrationLease',
  'newRegistrationProcessedAt',
  'newRegistrationPublishedAt',
  'newRegistrationStatsAt',
] as const satisfies ReadonlyArray<keyof JsonRegistration>

/**
 * The fields an organizer's edit never writes: the identity, the bookkeeping of the row and of its
 * creation, and what other writers own. The server refuses a patch operation on any of them, and the
 * admin client leaves them out of the operations it sends, since the row the edit continues from
 * may have been moved by those writers after the edit started (KOE-1574).
 */
export const ADMIN_PROTECTED_REGISTRATION_FIELDS = [
  'createdAt',
  'createdBy',
  'creationIdempotencyKey',
  'editToken',
  'editTokenVersion',
  'eventId',
  // Results are written by the results endpoints and the sending to Kennelliitto, which know the
  // lock; a registration form carries a copy that is old by the time it is saved (KOE-1140).
  'eventResult',
  'id',
  'kcResult',
  'modifiedAt',
  'modifiedBy',
  'updatedAt',
  ...NEW_REGISTRATION_WORKFLOW_FIELDS,
  // Written only with the payment or refund they come from (KOE-1531).
  ...REGISTRATION_MONEY_FIELDS,
] as const satisfies ReadonlyArray<keyof JsonRegistration>

type AdminProtectedRegistrationField = (typeof ADMIN_PROTECTED_REGISTRATION_FIELDS)[number]

const ADMIN_PROTECTED_REGISTRATION_FIELD_SET: ReadonlySet<string> = new Set(ADMIN_PROTECTED_REGISTRATION_FIELDS)

/** Whether a patch operation's first path segment is a field an organizer's edit may write. */
export const isAdminRegistrationOperationField = (field: unknown): boolean =>
  typeof field !== 'string' || !ADMIN_PROTECTED_REGISTRATION_FIELD_SET.has(field)

/** A copy of the registration without the fields an organizer's edit never writes. */
export const withoutAdminProtectedFields = <T extends Partial<Record<AdminProtectedRegistrationField, unknown>>>(
  registration: T
): T => withoutFields(registration, ADMIN_PROTECTED_REGISTRATION_FIELDS)

const PUBLIC_REGISTRATION_UPDATE_CANDIDATES: ReadonlyArray<PublicRegistrationField> = [
  ...PUBLIC_REGISTRATION_FIELDS,
  'id',
]

export const PUBLIC_REGISTRATION_UPDATE_FIELDS = PUBLIC_REGISTRATION_UPDATE_CANDIDATES.filter(
  (field) => field !== 'eventType' && field !== 'creationIdempotencyKey'
)

export const PUBLIC_REGISTRATION_OPERATION_FIELDS = PUBLIC_REGISTRATION_UPDATE_FIELDS.filter(
  (field) => field !== 'eventId' && field !== 'id'
)

const PUBLIC_REGISTRATION_OPERATION_FIELD_NAMES: ReadonlySet<string> = new Set(PUBLIC_REGISTRATION_OPERATION_FIELDS)

export const isPublicRegistrationOperationField = (field: unknown): field is PublicRegistrationField =>
  typeof field === 'string' && PUBLIC_REGISTRATION_OPERATION_FIELD_NAMES.has(field)

const REGISTRATION_ARRAY_FIELDS = [
  { path: ['dates'], required: true },
  { path: ['dog', 'results'], required: false },
  { path: ['optionalCosts'], required: false },
  { path: ['owners'], required: false },
  { path: ['qualifyingResults'], required: true },
  { path: ['results'], required: false },
] as const

const registrationFieldValue = (registration: unknown, path: readonly string[]) => {
  let value = registration
  for (const field of path) {
    if (!isObject(value) || !Object.hasOwn(value, field)) return { exists: false, value: undefined }
    value = value[field]
  }
  return { exists: true, value }
}

export const hasInvalidRegistrationArrayFields = (registration: unknown, requireRequired = false): boolean =>
  REGISTRATION_ARRAY_FIELDS.some(({ path, required }) => {
    const field = registrationFieldValue(registration, path)
    return field.exists ? !Array.isArray(field.value) : requireRequired && required
  })

/** The first day of the NOME-B SM ranking period for a trial that names none. */
const NOME_B_CH_QUALIFICATION_START_DAY_2023: DayKey = '2023-08-18'

/**
 * The first Finnish day of the NOME-B SM ranking period: the trial's `qualificationStartDate`, a Date in
 * the browser and its stored instant in a lambda, or 18.8.2023 for a trial that names none or one with
 * no day. The ranking (`rules_ch.ts`) and the entry's priority read it from here alike.
 */
export const nomeBChQualificationStartDay = (qualificationStartDate: Date | string | undefined): DayKey =>
  storedDayKey(qualificationStartDate) ?? NOME_B_CH_QUALIFICATION_START_DAY_2023

export const REG_CLASSES = new Set<RegistrationClass>(['ALO', 'AVO', 'VOI'])

export function getRegistrationClass(registration: Pick<JsonRegistration | Registration, 'class' | 'eventType'>): string
export function getRegistrationClass(registration: { class?: string | null; eventType?: string }): string | undefined
export function getRegistrationClass(registration: { class?: string | null; eventType?: string }) {
  return registration.class ?? registration.eventType
}

type RegistrationEditingEvent = EventVitals & Parameters<typeof getEventStateForClass>[0]
type RegistrationClassFields = Parameters<typeof getRegistrationClass>[0]

/**
 * Whether the participant's own entry is past changing: the trial's last day has gone, or the class
 * the entry sits in has been judged. Confirming, cancelling and reading an invitation close here
 * (KOE-1388, KOE-1584); cancelling closes earlier still (`isRegistrationCancelClosed`, KOE-1590).
 */
export const isRegistrationEditingClosed = (
  event: RegistrationEditingEvent,
  registration: RegistrationClassFields,
  now = new Date()
): boolean => isEntryEditingClosed(event, getEventStateForClass(event, getRegistrationClass(registration)), now)

/**
 * Whether the participant may no longer change what the entry says: from the close of entry to the
 * trial, while the entries are picked, and once editing has closed. On the trial days the form is
 * open again; what a picked or paid entrant may change is the form's own business (KOE-1584).
 */
export const isRegistrationContentLocked = (
  event: RegistrationEditingEvent,
  registration: RegistrationClassFields,
  now = new Date()
): boolean => isEntryClosed(event, now) || isRegistrationEditingClosed(event, registration, now)

/** The Finnish day before the trial has begun: from then on the dog is expected at the trial. */
const isCancelWindowOver = ({ startDate }: EventVitals, now: Date): boolean => {
  const start = storedDayKey(startDate)
  return start !== undefined && dayOf(now, TIME_ZONE) >= addDays(start, -1)
}

/**
 * Whether the participant may no longer cancel their own entry: from the Finnish day before the trial,
 * when only the secretary takes a dog off the list, and once editing has closed. The list page and
 * PutRegistration read it; the secretary's own cancellation has no such window (KOE-1590).
 */
export const isRegistrationCancelClosed = (
  event: RegistrationEditingEvent,
  registration: RegistrationClassFields,
  now = new Date()
): boolean => isCancelWindowOver(event, now) || isRegistrationEditingClosed(event, registration, now)

export const isRegistrationClass = (cls?: string | null): cls is RegistrationClass =>
  !!(cls && REG_CLASSES.has(cls as RegistrationClass))

const REFUNDABLE_GROUP_KEYS = new Set<string>([GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE])

type RegistrationPriorityFields = Pick<Registration, 'priorityByInvitation' | 'ownerHandles'> & {
  owner?: Pick<RegistrationPerson, 'membership'>
  owners?: (Pick<RegistrationPerson, 'membership'> & { key?: string })[]
  handler?: Pick<RegistrationPerson, 'membership'>
  dog?: Pick<Registration['dog'], 'breedCode'>
  qualifyingResults?: Registration['qualifyingResults'] | JsonRegistration['qualifyingResults']
}

type PriorityCheckFn<T, E extends PublicDogEvent | JsonPublicDogEvent = PublicDogEvent | JsonPublicDogEvent> = (
  event: Partial<Pick<E, 'eventType' | 'priority' | 'qualificationStartDate'>>,
  registration: RegistrationPriorityFields
) => T

const anyOwnerHasMembership = (registration?: MinimalRegistrationForMembership): boolean =>
  getRegistrationOwners(registration).some((owner) => owner?.membership)

/**
 * An unset `ownerHandles`/`ownerPays` selection is the (first) owner, for every reader: the form has
 * always shown it so. Only `false` names someone else (KOE-1598). A patch may carry `null` for it.
 */
export const withDefaultOwnerSelection = (selection: OwnerSelection | null | undefined): OwnerSelection =>
  selection ?? true

/** Whether a selection names someone other than an owner: the separate handler or payer. */
export const selectsSomeoneElse = (selection: OwnerSelection | null | undefined): boolean =>
  withDefaultOwnerSelection(selection) === false

/** Whether the separate handler's own membership counts, beside the owners'. */
const handlerMembershipCounts = (registration?: MinimalRegistrationForMembership): boolean =>
  selectsSomeoneElse(registration?.ownerHandles) && Boolean(registration?.handler?.membership)

export const isMember = (registration?: MinimalRegistrationForMembership): boolean =>
  anyOwnerHasMembership(registration) || handlerMembershipCounts(registration)

/**
 * Resolves which person a `ownerHandles`/`ownerPays` selection refers to: a specific owner by
 * `key` when multiple owners are on file, or the legacy single owner for older records / booleans.
 */
export function resolveOwnerSelection<O extends { key?: string }, L>(
  owners: O[] | undefined,
  legacyOwner: L,
  selection: OwnerSelection | null | undefined
): O | L | undefined {
  const selected = withDefaultOwnerSelection(selection)
  if (!selected) return undefined
  // A key only means something against an owner list; a key that matches nobody resolves to no one
  // rather than silently falling back to the first/legacy owner.
  if (typeof selected === 'string') {
    if (!owners?.length) return legacyOwner
    return owners.find((o) => o.key === selected)
  }
  return owners?.[0] ?? legacyOwner
}

/**
 * Key of the owner an `ownerHandles`/`ownerPays` selection names, or `undefined` when the selection
 * points outside the owner list ("someone else", or a stale key that matches nobody). Keyless
 * (legacy/API-written) owners are keyed by position, exactly as the form keys them.
 */
const selectedOwnerKey = (owners: readonly unknown[], selection: OwnerSelection | undefined): string | undefined => {
  const keys = owners.map((owner, index) => ownerKeyAt(owner, index))
  if (typeof selection === 'string') return keys.includes(selection) ? selection : undefined
  return withDefaultOwnerSelection(selection) ? keys[0] : undefined
}

/** How much contact information an owner has to give. */
export type OwnerRole = 'handles' | 'pays' | 'none'

/**
 * The role that decides what an owner must tell about themselves: the handling owner is the one the
 * organizer has to reach at the trial, the paying owner receives the receipt, and a co-owner who
 * does neither is only named — their phone, hometown and email are nobody's business (KOE-1351).
 */
export const getOwnerRole = (
  registration: {
    owners?: { key?: string }[]
    owner?: unknown
    ownerHandles?: OwnerSelection
    ownerPays?: OwnerSelection
  },
  ownerKey: string | undefined
): OwnerRole => {
  if (!ownerKey) return 'none'
  const owners = getRegistrationOwners(registration)
  if (selectedOwnerKey(owners, registration.ownerHandles) === ownerKey) return 'handles'
  if (selectedOwnerKey(owners, registration.ownerPays) === ownerKey) return 'pays'
  return 'none'
}

/**
 * Drops the client-only owner list `key`, for persisting anywhere a plain unkeyed
 * `RegistrationPerson` is expected (`owner`, `handler`, `payer`).
 */
export const stripOwnerKey = <O extends { key?: string }>(owner: O): Omit<O, 'key'> => {
  const { key: _key, ...person } = owner
  return person
}

/**
 * Like {@link resolveOwnerSelection}, but returns a plain person without the owner list `key`,
 * for persisting as `handler`/`payer` (which are not keyed).
 */
export const resolveOwnerPerson = (
  owners: RegistrationOwner[] | undefined,
  legacyOwner: RegistrationPerson | undefined,
  selection: OwnerSelection | undefined
): RegistrationPerson | undefined => {
  const resolved = resolveOwnerSelection(owners, legacyOwner, selection)
  if (!resolved) return undefined
  return stripOwnerKey(resolved as RegistrationOwner)
}

const getOverridePerson = <O extends { key?: string }, L, F>(
  owners: O[] | undefined,
  legacyOwner: L,
  selection: OwnerSelection | undefined,
  fallback: F
): O | L | F | undefined => resolveOwnerSelection(owners, legacyOwner, selection) ?? fallback

/** The person who handles the dog: the owner the `ownerHandles` selection names, or the separate handler. */
export const getHandlingPerson = <O extends { key?: string }, L, H>(registration: {
  owners?: O[]
  owner?: L
  ownerHandles?: OwnerSelection
  handler?: H
}): O | L | H | undefined =>
  getOverridePerson(registration.owners, registration.owner, registration.ownerHandles, registration.handler)

/** The person who pays: the owner the `ownerPays` selection names, or the separate payer. */
export const getPayingPerson = <O extends { key?: string }, L, P>(registration: {
  owners?: O[]
  owner?: L
  ownerPays?: OwnerSelection
  payer?: P
}): O | L | P | undefined =>
  getOverridePerson(registration.owners, registration.owner, registration.ownerPays, registration.payer)

/**
 * Everyone a registration's email is addressed to: the handling person plus all owners, deduplicated.
 * The backend `emailTo` addresses the same set, so anything reporting recipients to the user must
 * use this rather than a single owner.
 */
/**
 * The templates the payer reads too. A request for a missing part of the fee goes to whoever paid
 * the first part (KOE-722): the payer is not always the handler or an owner.
 */
export const isPayerTemplate = (template?: EmailTemplateId): boolean => template === 'payment-request'

export const getRegistrationEmails = (
  registration: {
    owners?: { email?: string; key?: string }[]
    owner?: { email?: string }
    ownerHandles?: OwnerSelection
    handler?: { email?: string }
    payer?: { email?: string }
  },
  template?: EmailTemplateId
): string[] =>
  unique(
    [
      getHandlingPerson(registration)?.email,
      ...getRegistrationOwners(registration).map((owner) => owner?.email),
      isPayerTemplate(template) ? registration.payer?.email : undefined,
    ].filter((email): email is string => Boolean(email))
  )

/** Applies the `ownerHandles`/`ownerPays` selections for saving: the selected owner is persisted as handler/payer. */
export const withRegistrationOverrides = (reg: Registration): Registration => ({
  ...reg,
  handler: resolveOwnerPerson(reg.owners, reg.owner, reg.ownerHandles) ?? reg.handler,
  payer: resolveOwnerPerson(reg.owners, reg.owner, reg.ownerPays) ?? reg.payer,
})

const hasMembershipPriority: PriorityCheckFn<boolean> = (event, registration) =>
  Boolean(event.priority?.includes(PRIORITY_MEMBER) && isMember(registration))

const hasInvitationPriority: PriorityCheckFn<boolean> = (event, registration) =>
  Boolean(event.priority?.includes(PRIORITY_INVITED) && registration.priorityByInvitation)

const hasBreedPriority: PriorityCheckFn<boolean> = (event, registration) =>
  Boolean(registration.dog?.breedCode && event.priority?.includes(registration.dog.breedCode))

const hasNomeBSMPriority: PriorityCheckFn<false | 'b-sm.2' | 'b-sm.3'> = (event, registration) => {
  if (event.eventType === 'NOME-B SM') {
    const count = registration.qualifyingResults?.reduce((acc, r) => acc + (r.result === 'VOI1' ? 1 : 0), 0) ?? 0
    if (count >= 3) return 'b-sm.3'

    // The KVA's day: a key, or the older stored forms of a registration written before keys (KOE-1548).
    const kvaDate = registration.qualifyingResults?.find((r) => r.result === 'FI KVA-B')?.date
    const kvaDay = kvaDate ? calendarDayOf(kvaDate, TIME_ZONE) : undefined
    if (kvaDay && count === 2 && kvaDay < nomeBChQualificationStartDay(event.qualificationStartDate)) {
      return 'b-sm.2'
    }
  }
  return false
}

/**
 * Whether the registration is inside the event's entry restrictions (KOE-525). One is enough: a
 * member's dog of another breed enters a trial restricted to members and the named breeds alike.
 * An event that restricts nothing admits everyone, and only the values the secretary can choose
 * (`RESTRICTION`) count as a restriction.
 */
export const meetsRestrictions = (
  event: Partial<Pick<PublicDogEvent | JsonPublicDogEvent, 'restrictions'>>,
  registration: RegistrationPriorityFields
): boolean => {
  const restrictions = priorityValuesToPriority(event.restrictions, RESTRICTION).map((r) => r.value)
  if (restrictions.length === 0) return true
  if (restrictions.includes(PRIORITY_MEMBER) && isMember(registration)) return true
  return Boolean(registration.dog?.breedCode && restrictions.includes(registration.dog.breedCode))
}

export const hasPriority: PriorityCheckFn<true | false | 0.5> = (event, registration) => {
  if (event.priority?.includes(PRIORITY_MEMBER)) {
    const anyOwnerIsMember = anyOwnerHasMembership(registration)
    if (anyOwnerIsMember || handlerMembershipCounts(registration)) {
      const handlingPerson = getHandlingPerson(registration)
      return handlingPerson?.membership && anyOwnerIsMember ? true : 0.5
    }
  }
  if (
    hasInvitationPriority(event, registration) ||
    hasBreedPriority(event, registration) ||
    hasNomeBSMPriority(event, registration)
  ) {
    return true
  }
  return false
}

export const priorityDescriptionKey: PriorityCheckFn<
  'member' | 'invited' | 'breed' | 'b-sm.3' | 'b-sm.2' | undefined
> = (event, registration) => {
  if (hasMembershipPriority(event, registration)) return PRIORITY_MEMBER

  if (hasInvitationPriority(event, registration)) return PRIORITY_INVITED

  if (hasBreedPriority(event, registration)) return 'breed'

  const nomeBSMPriority = hasNomeBSMPriority(event, registration)

  if (nomeBSMPriority) return nomeBSMPriority
}

/**
 * Structural minimum the sort needs, so it serves stored registrations and public projections alike —
 * including a public row whose number is withheld until the class's start numbers are published.
 */
type SortablePlacement = { date?: GroupDate; key?: string; number?: number; time?: RegistrationTime }

export type SortableRegistration = {
  class?: string | null
  eventType?: string
  group?: SortablePlacement
  /** The frozen, published placement (KOE-1017); once it exists, it is the order everyone sees. */
  startGroup?: SortablePlacement
}

/** The frozen placement wins over the working order: a published number is where the dog runs. */
export const getRegistrationPlacement = <T extends SortableRegistration>(
  registration: T
): NonNullable<T['startGroup']> | T['group'] => registration.startGroup ?? registration.group

const placementOf = (registration: SortableRegistration): SortablePlacement | undefined =>
  getRegistrationPlacement(registration)

/**
 * A placement's day as it sorts: the trial's calendar day, the one rule `getRegistrationGroupDay` reads
 * (a stored key, the instant a row stored before KOE-1547 holds, the browser's Date of the same day),
 * and after every day for none.
 */
const sortableDate = (date: GroupDate | undefined): string => getRegistrationGroupDay(date) || '\uffff'

export const getRegistrationGroupTime = (registration: SortableRegistration): RegistrationTime =>
  placementOf(registration)?.time ?? 'kp'

const byTimeAndNumber = <T extends SortableRegistration>(a: T, b: T): number =>
  getRegistrationGroupTime(a) === getRegistrationGroupTime(b)
    ? (placementOf(a)?.number ?? Number.MAX_SAFE_INTEGER) - (placementOf(b)?.number ?? Number.MAX_SAFE_INTEGER)
    : getRegistrationGroupTime(a).localeCompare(getRegistrationGroupTime(b))

const byClassTimeAndNumber = <T extends SortableRegistration>(a: T, b: T): number =>
  getRegistrationClass(a) === getRegistrationClass(b)
    ? byTimeAndNumber(a, b)
    : (getRegistrationClass(a) ?? '').localeCompare(getRegistrationClass(b) ?? '')

export const sortRegistrationsByDateClassTimeAndNumber = <T extends SortableRegistration>(a: T, b: T): number =>
  sortableDate(placementOf(a)?.date) === sortableDate(placementOf(b)?.date)
    ? byClassTimeAndNumber(a, b)
    : sortableDate(placementOf(a)?.date).localeCompare(sortableDate(placementOf(b)?.date))

export const getRegistrationNumberingGroupKey = <T extends JsonRegistration | Registration>(
  reg: Pick<T, 'cancelled' | 'class' | 'eventType' | 'group'>
) => {
  const classOrType = getRegistrationClass(reg)
  if (reg.cancelled) {
    return `${GROUP_KEY_CANCELLED}-${classOrType}`
  }
  if (reg.group?.date) {
    return 'participants'
  }
  // A WT trial's reserve list is the whole trial's, so its numbers run across the classes (KOE-912).
  return hasSharedReserveList(reg.eventType) ? GROUP_KEY_RESERVE : `${GROUP_KEY_RESERVE}-${classOrType}`
}

export const isParticipantGroup = (group?: string): boolean =>
  Boolean(group) && group !== GROUP_KEY_RESERVE && group !== GROUP_KEY_CANCELLED

/** The trial's calendar day of a group's date, or '' when it has none (or none that reads as a date). */
export const getRegistrationGroupDay = (date: GroupDate | undefined): string => storedDayKey(date) ?? ''

/**
 * The one rule for which group a start belongs to: a participant group is named by the trial's day
 * and the time (`eventRegistrationDateKey`), whatever spelling the stored key has. Rows written by an
 * older copy of an event carry the UTC day, which is another day for a start at the Helsinki
 * midnight (KOE-1541). Reserve, cancelled and a group without a usable date and time keep their key.
 */
export const deriveParticipantGroupKey = (group: NonNullable<RegistrationPlacement['group']>): string => {
  const day = storedDayKey(group.date)
  if (!isParticipantGroup(group.key) || !day || !group.time) return group.key
  return groupKeyOf(day, group.time)
}

type PlacedGroup = NonNullable<RegistrationPlacement['group']> & { number?: number }

/**
 * Whether a group row differs from the one before only in how its key is spelled: the same day,
 * time and number under the other key. That write repairs a stored key (KOE-1541) and says nothing
 * about the dog's place, so it is not worth a line in the trail.
 */
export const isKeyRespelling = (previous: PlacedGroup | undefined, group: PlacedGroup | undefined): boolean =>
  !!previous &&
  !!group &&
  previous.key !== group.key &&
  previous.number === group.number &&
  deriveParticipantGroupKey(previous) === deriveParticipantGroupKey(group)

export const getRegistrationGroupKey = (reg: RegistrationPlacement): string => {
  if (reg.cancelled) {
    return GROUP_KEY_CANCELLED
  }
  return reg.group ? deriveParticipantGroupKey(reg.group) : GROUP_KEY_RESERVE
}

/** A start: an entry that is not cancelled and sits in a participant group, not on the reserve list. */
export const isStarter = (reg: RegistrationPlacement): boolean => isParticipantGroup(getRegistrationGroupKey(reg))

/**
 * A registration that carries the server's payment picture, as every response to the participant
 * does (KOE-1530): what the participant's pages need before they can say anything of the payment.
 */
export const hasPaymentPicture = <T extends Pick<Registration, 'payment'>>(
  registration: T
): registration is T & { payment: PaymentPicture } => registration.payment !== undefined

/**
 * The picked participants by class, a classless event's under its event type: what the publishing
 * gates count on the panel and on the server alike (KOE-1466).
 */
export const groupParticipantsByClass = <
  T extends Pick<JsonRegistration | Registration, 'cancelled' | 'class' | 'eventType' | 'group'>,
>(
  registrations: readonly T[]
): Record<string, T[]> => {
  const byClass: Record<string, T[]> = {}
  for (const registration of registrations) {
    if (!isStarter(registration)) continue
    const eventClass = getRegistrationClass(registration)
    byClass[eventClass] ??= []
    byClass[eventClass].push(registration)
  }
  return byClass
}

/**
 * Whether a result can be recorded for this entry at all. Only the dogs that actually ran are scored: a
 * reserve never called up and a cancelled entry have no round to record, and offering them a row invites
 * a result being entered against the wrong dog.
 */
export const isScorableRegistration = <T extends JsonRegistration | Registration>(
  reg: Pick<T, 'cancelled' | 'group'>
): boolean => isStarter(reg)

/** Whether any of what was paid is still with the organizer, handling fees counted as kept. */
export const hasRefundableBalance = <T extends JsonRegistration | Registration>(reg: Pick<T, RefundField>): boolean =>
  getNetPaidAmount(reg) > 0

export const canRefund = <T extends RegistrationPlacement & RegistrationRefundAmounts>(reg: T): boolean =>
  hasRefundableBalance(reg) && REFUNDABLE_GROUP_KEYS.has(getRegistrationGroupKey(reg))

/**
 * Whether a payment has gone back: something was refunded and nothing of what was paid is left,
 * the handling fee kept from the refund aside. Such an entry has not paid for a place (KOE-1526).
 */
export const isPaymentReturned = <T extends JsonRegistration | Registration>(reg: Pick<T, RefundField>): boolean =>
  (reg.refundAmount ?? 0) > 0 && !hasRefundableBalance(reg)

/**
 * A reserve that did not get a place and had its fee back: it owes nothing while it has no place,
 * and owes the fee again once it is lifted into one (KOE-1526). An entry without a group counts as a
 * reserve, as it does for the refund.
 */
export const isReturnedReserve = (reg: RegistrationPlacement & RegistrationRefundAmounts): boolean =>
  !isStarter(reg) && isPaymentReturned(reg)

export const getSelectedAdditionalCosts = (
  event: MinimalEventForCost,
  registration: MinimalRegistrationForCost
): CustomCost[] => {
  const cost = event.cost

  if (typeof cost === 'number') return []

  return registration.optionalCosts?.map((n) => cost.optionalAdditionalCosts?.[n]).filter(isDefined) ?? []
}

type InvitationAttachmentEvent = Partial<
  Pick<
    ConfirmedEvent | JsonConfirmedEvent,
    'entryEndDate' | 'invitationAttachment' | 'invitationAttachments' | 'startDate'
  >
>
export type InvitationAttachmentRegistration = Pick<
  JsonRegistration | Registration,
  'class' | 'eventType' | 'invitationAttachmentRead' | 'invitationAttachmentSent' | 'invitationRead' | 'messagesSent'
>

type InvitationReadStatus = 'not-sent' | 'unread' | 'read-latest' | 'read-previous'

/** What a registration records about the invitation sent to it and its reading. */
type InvitationState = Pick<
  JsonRegistration | Registration,
  'invitationAttachmentRead' | 'invitationAttachmentSent' | 'invitationRead' | 'messagesSent'
>

/**
 * Removes the record of an invitation: that it was sent, which attachment went with it and what the
 * participant read. A registration copied into another event was invited to the source event, whose
 * attachment the copy does not share (KOE-1564); the copy's secretary sends its own invitation. The
 * other messages the registration got stay recorded.
 */
export const clearInvitationState = <T extends InvitationState>(registration: T): T => {
  delete registration.invitationAttachmentRead
  delete registration.invitationAttachmentSent
  delete registration.invitationRead
  delete registration.messagesSent?.invitation
  return registration
}

export const getInvitationReadStatus = (registration: InvitationState): InvitationReadStatus => {
  if (!registration.messagesSent?.invitation && !registration.invitationAttachmentSent) {
    return registration.invitationRead ? 'read-latest' : 'not-sent'
  }

  if (registration.invitationAttachmentRead) {
    return !registration.invitationAttachmentSent ||
      registration.invitationAttachmentRead === registration.invitationAttachmentSent
      ? 'read-latest'
      : 'read-previous'
  }

  // Before attachment-specific receipts, invitationRead only meant that the
  // then-current invitation had been acknowledged.
  return registration.invitationRead ? 'read-latest' : 'unread'
}

export const getCurrentInvitationAttachment = (
  event: Partial<Pick<ConfirmedEvent | JsonConfirmedEvent, 'invitationAttachment' | 'invitationAttachments'>>,
  registration: Pick<JsonRegistration | Registration, 'class' | 'eventType'>
) => event.invitationAttachments?.[getRegistrationClass(registration)] ?? event.invitationAttachment

export const getSentInvitationAttachment = (
  event: InvitationAttachmentEvent,
  registration: InvitationAttachmentRegistration
) =>
  registration.messagesSent?.invitation && registration.invitationAttachmentSent
    ? registration.invitationAttachmentSent
    : getCurrentInvitationAttachment(event, registration)

/**
 * What a participant's `invitationRead: true` acknowledges: the first reading, or a reading of an
 * attachment newer than the one read before. A cancelled registration acknowledges nothing. When it
 * counts, `attachment` names what was read, so the receipt can be stored against it.
 */
export const resolveInvitationRead = (
  event: InvitationAttachmentEvent,
  existing: InvitationAttachmentRegistration & Pick<JsonRegistration | Registration, 'cancelled'>,
  invitationRead: boolean | undefined
): { attachment?: string; read: boolean } => {
  const attachment = getSentInvitationAttachment(event, existing)
  const previous =
    existing.invitationAttachmentRead ??
    (existing.invitationRead ? (existing.invitationAttachmentSent ?? attachment) : undefined)
  const read =
    Boolean(invitationRead) &&
    !existing.cancelled &&
    (!existing.invitationRead || Boolean(attachment && previous !== attachment))

  return { attachment: read ? attachment : undefined, read }
}

export const shouldSendInvitationToRegistration = (
  event: InvitationAttachmentEvent,
  registration: InvitationAttachmentRegistration
): boolean => {
  if (!registration.messagesSent?.invitation) {
    return true
  }

  const currentAttachment = getCurrentInvitationAttachment(event, registration)
  const currentClassAttachment = event.invitationAttachments?.[getRegistrationClass(registration)]

  if (!registration.invitationAttachmentSent) {
    return Boolean(currentClassAttachment)
  }

  return Boolean(currentAttachment && registration.invitationAttachmentSent !== currentAttachment)
}

export const getInvitationRecipients = <T extends InvitationAttachmentRegistration>(
  event: InvitationAttachmentEvent,
  registrations: T[]
): T[] => registrations.filter((registration) => shouldSendInvitationToRegistration(event, registration))

export const getParticipantMessageInfo = <T extends InvitationAttachmentRegistration>(
  event: InvitationAttachmentEvent,
  classState: EventState,
  selectedRegistrations: T[]
): { canSend: boolean; recipients: T[]; templateId: EmailTemplateId } => {
  const canSendAfterEntry = isEntryClosed(event)

  if (classState === 'confirmed') {
    return {
      canSend: canSendAfterEntry && selectedRegistrations.length > 0,
      recipients: selectedRegistrations,
      templateId: 'picked',
    }
  }

  const recipients = getInvitationRecipients(event, selectedRegistrations)

  return {
    canSend: canSendAfterEntry && ['picked', 'invited'].includes(classState) && recipients.length > 0,
    recipients,
    templateId: 'invitation',
  }
}

type InvitationPaymentEvent = InvitationAttachmentEvent & Parameters<typeof getEventStateForClass>[0]

type InvitationPaymentRegistration = InvitationAttachmentRegistration &
  RegistrationPlacement &
  Pick<JsonRegistration | Registration, 'cancelled'>

/** Whether the place has been paid for, as the entry's payment picture says (`getPaymentPicture`). */
type PaidForPlace = Pick<PaymentPicture, 'paidForPlace'>

/**
 * Whether the koekutsu round has been sent for this registration: its own class is invited, or the
 * trial as a whole is. Both are what the group move reads when it decides to invite a dog it lifts.
 */
const isInvitedRound = (event: InvitationPaymentEvent, registration: InvitationPaymentRegistration): boolean =>
  event.state === 'invited' || getEventStateForClass(event, getRegistrationClass(registration)) === 'invited'

/**
 * Whether this participant is still owed the koekutsu of a round that has already gone out: the
 * dog lifted from the reserve list after the others were invited.
 */
const isInvitationDue = (event: InvitationPaymentEvent, registration: InvitationPaymentRegistration): boolean =>
  isStarter(registration) &&
  isInvitedRound(event, registration) &&
  shouldSendInvitationToRegistration(event, registration)

/**
 * The koekutsu that the automatic send held back until the place is paid for (KOE-1191). The
 * secretary can still send it by hand; this only says what the trial is waiting for. Whether the
 * place is paid for is the payment picture's, worked out by the caller from the same row, so the
 * secretary's views and the group move read one rule (KOE-1552).
 */
export const isInvitationAwaitingPayment = (
  event: InvitationPaymentEvent,
  registration: InvitationPaymentRegistration,
  payment: PaidForPlace
): boolean => isInvitationDue(event, registration) && !payment.paidForPlace

/** The same koekutsu once the money is in: what the group move and the payment callback send. */
export const shouldSendInvitationAfterPayment = (
  event: InvitationPaymentEvent,
  registration: InvitationPaymentRegistration,
  payment: PaidForPlace
): boolean => isInvitationDue(event, registration) && payment.paidForPlace

interface RegistrationEmailTemplateOptions {
  previousGroup?: JsonRegistrationGroup
  editToken?: string
  /** Where the fee stands, for a payment request (KOE-722); the caller computes it (`getPaymentBalance`). */
  paymentBalance?: PaymentBalance
}

/**
 * The participant list's name for the last message sent, in the language `t` speaks (KOE-1454). A
 * registration email goes by its subject, as the email itself does: one template sends the
 * confirmation and the cancellation alike (KOE-1455). A string was recorded before KOE-1454 as a
 * finished Finnish sentence and is shown as it was written.
 */
export const getLastEmailText = (
  lastEmail: Registration['lastEmail'] | JsonRegistration['lastEmail'],
  t: TFunction
): string => {
  if (lastEmail === undefined) return ''
  if (typeof lastEmail === 'string') return lastEmail

  const { context, groupNumber, sentAt, template } = lastEmail
  const name =
    template === 'registration' ? t('registration.email.subject', { context }) : t(`emailTemplate.${template}`)
  const place = template === 'reserve' ? ` (#${groupNumber ?? '?'})` : ''
  return `${name}${place} ${t('dateFormat.date', { date: sentAt })} ${t('dateFormat.time', { date: sentAt })}`
}

export const getRegistrationEmailTemplateData = (
  registration: JsonRegistration | Registration,
  confirmedEvent: JsonConfirmedEvent | ConfirmedEvent,
  origin: string | undefined,
  context: RegistrationTemplateContext,
  text: string | undefined,
  t: TFunction,
  options: RegistrationEmailTemplateOptions = {}
) => {
  const { editToken, paymentBalance, previousGroup } = options
  const eventDate = t('dateFormat.datespan', { end: confirmedEvent.endDate, start: confirmedEvent.startDate })
  const reserveText = t(`registration.reserveChoises.${registration.reserve || 'ANY'}`)
  const dogBreed = registration.dog.breedCode ? t(`${registration.dog.breedCode}`, { ns: 'breed' }) : ''
  const regDates = registration.dates
    .map((d) => {
      const timeText = d.time ? t(`registration.time.${d.time}`) : ''
      return t('dateFormat.short', { date: d.date }) + (timeText ? ` ${timeText}` : '')
    })
    .join(', ')
  const accessPath = editToken ? `/access/${encodeURIComponent(editToken)}` : ''
  const link = `${origin}/r/${registration.eventId}/${registration.id}${accessPath}`
  const paymentLink = `${origin}/p/${registration.eventId}/${registration.id}${accessPath}`
  // A result's day from any form it was stored in; none for one without a day (KOE-1548).
  const qualifyingResults = registration.qualifyingResults.map((r) => {
    const day = calendarDayOf(r.date, TIME_ZONE)
    return { ...r, date: day ? t('dateFormat.date', { date: day }) : '' }
  })
  const delayedPayment = confirmedEvent.paymentTime === 'confirmation'

  // Group information. Use previous group when provided.
  const group = previousGroup ?? registration.group
  // A dog not placed on a day yet (a reserve, or before the selection) has no group date: the
  // dates it entered for stand in, so a template's date line is never blank (KOE-1458).
  const groupDate = group?.date ? t('dateFormat.wdshort', { date: group.date }) : regDates
  const groupTime = group?.time ? t(`registration.timeLong.${group.time}`) : ''
  const groupNumber = group?.number ?? '?'

  const invitationLink = `${link}/invitation`
  const cancelReason = isPredefinedReason(registration.cancelReason)
    ? t(`registration.cancelReason.${registration.cancelReason}`)
    : (registration.cancelReason ?? '')

  const selectedAdditionalCosts = getSelectedAdditionalCosts(confirmedEvent, registration)
  const selectedServices = selectedAdditionalCosts
    .map((c) => c.description[registration.language] ?? c.description.fi)
    .join(', ')
  const event = {
    ...confirmedEvent,
    // The name and additional info read in the registrant's language (KOE-1263), so the templates
    // need no language awareness of their own.
    description: localizedEventDescription(confirmedEvent, registration.language),
    invitationAttachment: getCurrentInvitationAttachment(confirmedEvent, registration),
    name: localizedEventName(confirmedEvent, registration.language),
  }

  return {
    cancelReason,
    delayedPayment,
    dogBreed,
    event,
    eventDate,
    groupDate,
    groupNumber,
    groupTime,
    invitationLink,
    link,
    origin,
    paymentCost: paymentBalance ? formatMoney(paymentBalance.cost) : '',
    paymentDue: paymentBalance ? formatMoney(paymentBalance.due) : '',
    paymentLink,
    paymentPaid: paymentBalance ? formatMoney(paymentBalance.paid) : '',
    qualifyingResults,
    reg: registration,
    regDates,
    reserveText,
    selectedServices,
    subject: t('registration.email.subject', { context, defaultValue: '' }),
    text,
    title: t('registration.email.title', { context, defaultValue: '' }),
  }
}

export const isPredefinedReason = (v?: string): v is 'dog-heat' | 'handler-sick' | 'dog-sick' | 'gdpr' | 'unpaid' =>
  !!v && ['dog-heat', 'handler-sick', 'dog-sick', 'gdpr', 'unpaid'].includes(v)

export const getNextClass = (c: RegistrationClass | undefined | null): RegistrationClass | undefined => {
  if (c === 'ALO') {
    return 'AVO'
  }
  if (c === 'AVO') {
    return 'VOI'
  }
}

type RegistrationActorSource = Pick<
  Patch<JsonRegistration>,
  'handler' | 'owner' | 'ownerHandles' | 'ownerPays' | 'owners' | 'payer'
>

const trimmedName = (person: unknown): string | undefined => {
  const name = isObject(person) && typeof person.name === 'string' ? person.name.trim() : ''
  return name || undefined
}

/**
 * Whom a participant's own save is attributed to. The public registration routes have no login to
 * name, so the name comes from the registration's people: the paying person (the owner the
 * `ownerPays` selection names, else the separate payer), else the handling person, else the first
 * owner. `anonymous` only for a body that names no one at all.
 */
export const getRegistrationActorName = (registration: RegistrationActorSource): string => {
  // A patch may carry `null` for any of these; the selection helpers want them absent instead.
  const people = {
    handler: registration.handler ?? undefined,
    owner: registration.owner ?? undefined,
    ownerHandles: registration.ownerHandles ?? undefined,
    ownerPays: registration.ownerPays ?? undefined,
    owners: (registration.owners ?? []).filter(isObject),
    payer: registration.payer ?? undefined,
  }

  return (
    trimmedName(getPayingPerson(people)) ??
    trimmedName(getHandlingPerson(people)) ??
    trimmedName(getRegistrationOwners(people)[0]) ??
    'anonymous'
  )
}

/** The participant's own save as an audit actor: named from the registration, and marked as such. */
export const registrationActor = (registration: RegistrationActorSource): AuditActor => ({
  name: getRegistrationActorName(registration),
  source: 'registration',
})
