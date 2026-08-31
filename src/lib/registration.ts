import type { TFunction } from 'i18next'
import type {
  ConfirmedEvent,
  CustomCost,
  EmailTemplateId,
  EventState,
  JsonConfirmedEvent,
  JsonPublicDogEvent,
  JsonRegistration,
  JsonRegistrationGroup,
  MinimalEventForCost,
  MinimalRegistrationForCost,
  MinimalRegistrationForMembership,
  PublicDogEvent,
  Registration,
  RegistrationClass,
  RegistrationOwner,
  RegistrationPerson,
  RegistrationTemplateContext,
  RegistrationTime,
} from '../types'
import { nanoid } from 'nanoid'
import { emptyBreeder, emptyDog, emptyPerson } from './data'
import { isEntryClosed } from './event'
import { PRIORITY_INVITED, PRIORITY_MEMBER } from './priority'
import { isDefined } from './typeGuards'
import { isObject, unique } from './utils'

export const GROUP_KEY_CANCELLED = 'cancelled'
export const GROUP_KEY_RESERVE = 'reserve'

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
export const getRegistrationOwners = <O, L>(registration?: { owners?: O[]; owner?: L }): (O | L)[] =>
  registration?.owners?.length ? registration.owners : registration?.owner ? [registration.owner] : []

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

export const NOME_B_CH_qualificationStartDate2023 = new Date('2023-08-17T21:00:00Z')

export const REG_CLASSES = new Set<RegistrationClass>(['ALO', 'AVO', 'VOI'])

export function getRegistrationClass(registration: Pick<JsonRegistration | Registration, 'class' | 'eventType'>): string
export function getRegistrationClass(
  registration: Partial<Pick<JsonRegistration | Registration, 'class' | 'eventType'>>
): string | undefined
export function getRegistrationClass(
  registration: Partial<Pick<JsonRegistration | Registration, 'class' | 'eventType'>>
) {
  return registration.class ?? registration.eventType
}

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

export const isMember = (registration?: MinimalRegistrationForMembership): boolean =>
  Boolean(anyOwnerHasMembership(registration) || (!registration?.ownerHandles && registration?.handler?.membership))

/** An unset `ownerHandles`/`ownerPays` selection defaults to the (first) owner. */
export const withDefaultOwnerSelection = (selection: boolean | string | undefined): boolean | string =>
  selection ?? true

/**
 * Resolves which person a `ownerHandles`/`ownerPays` selection refers to: a specific owner by
 * `key` when multiple owners are on file, or the legacy single owner for older records / booleans.
 */
export function resolveOwnerSelection<O extends { key?: string }, L>(
  owners: O[] | undefined,
  legacyOwner: L,
  selection: boolean | string | undefined
): O | L | undefined {
  if (!selection) return undefined
  // A key only means something against an owner list; a key that matches nobody resolves to no one
  // rather than silently falling back to the first/legacy owner.
  if (typeof selection === 'string') {
    if (!owners?.length) return legacyOwner
    return owners.find((o) => o.key === selection)
  }
  return owners?.[0] ?? legacyOwner
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
  selection: boolean | string | undefined
): RegistrationPerson | undefined => {
  const resolved = resolveOwnerSelection(owners, legacyOwner, selection)
  if (!resolved) return undefined
  return stripOwnerKey(resolved as RegistrationOwner)
}

const getOverridePerson = <O extends { key?: string }, L, F>(
  owners: O[] | undefined,
  legacyOwner: L,
  selection: boolean | string | undefined,
  fallback: F
): O | L | F | undefined => resolveOwnerSelection(owners, legacyOwner, selection) ?? fallback

/** The person who handles the dog: the owner the `ownerHandles` selection names, or the separate handler. */
export const getHandlingPerson = <O extends { key?: string }, L, H>(registration: {
  owners?: O[]
  owner?: L
  ownerHandles?: boolean | string
  handler?: H
}): O | L | H | undefined =>
  getOverridePerson(registration.owners, registration.owner, registration.ownerHandles, registration.handler)

/** The person who pays: the owner the `ownerPays` selection names, or the separate payer. */
export const getPayingPerson = <O extends { key?: string }, L, P>(registration: {
  owners?: O[]
  owner?: L
  ownerPays?: boolean | string
  payer?: P
}): O | L | P | undefined =>
  getOverridePerson(registration.owners, registration.owner, registration.ownerPays, registration.payer)

/**
 * Everyone a registration's email is addressed to: the handling person plus all owners, deduplicated.
 * The backend `emailTo` addresses the same set, so anything reporting recipients to the user must
 * use this rather than a single owner.
 */
export const getRegistrationEmails = (registration: {
  owners?: { email?: string; key?: string }[]
  owner?: { email?: string }
  ownerHandles?: boolean | string
  handler?: { email?: string }
}): string[] =>
  unique(
    [
      getHandlingPerson(registration)?.email,
      ...getRegistrationOwners(registration).map((owner) => owner?.email),
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

    const kvaDateOrString = registration.qualifyingResults?.find((r) => r.result === 'FI KVA-B')?.date
    const kvaDate = typeof kvaDateOrString === 'string' ? new Date(kvaDateOrString) : kvaDateOrString
    if (kvaDate && count === 2) {
      const qStartDateOrString = event.qualificationStartDate ?? NOME_B_CH_qualificationStartDate2023
      const qStartDate = typeof qStartDateOrString === 'string' ? new Date(qStartDateOrString) : qStartDateOrString

      if (kvaDate.valueOf() < qStartDate.valueOf()) return 'b-sm.2'
    }
  }
  return false
}

export const hasPriority: PriorityCheckFn<true | false | 0.5> = (event, registration) => {
  if (event.priority?.includes(PRIORITY_MEMBER)) {
    const anyOwnerIsMember = anyOwnerHasMembership(registration)
    const registrationIsMember =
      anyOwnerIsMember || (!registration.ownerHandles && Boolean(registration.handler?.membership))
    if (registrationIsMember) {
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

export type SortableRegistration = {
  class?: Exclude<JsonRegistration['class'], undefined>
  eventType?: Exclude<JsonRegistration['eventType'], undefined>
  group?: Exclude<JsonRegistration['group'] | Registration['group'], undefined>
}

const sortableDate = (date: string | Date | undefined): string =>
  date instanceof Date ? date.toISOString() : (date ?? '\uffff')

export const getRegistrationGroupTime = (registration: SortableRegistration): RegistrationTime =>
  registration.group?.time ?? 'kp'

const byTimeAndNumber = <T extends SortableRegistration>(a: T, b: T): number =>
  getRegistrationGroupTime(a) === getRegistrationGroupTime(b)
    ? (a.group?.number ?? Number.MAX_SAFE_INTEGER) - (b.group?.number ?? Number.MAX_SAFE_INTEGER)
    : getRegistrationGroupTime(a).localeCompare(getRegistrationGroupTime(b))

const byClassTimeAndNumber = <T extends SortableRegistration>(a: T, b: T): number =>
  getRegistrationClass(a) === getRegistrationClass(b)
    ? byTimeAndNumber(a, b)
    : (getRegistrationClass(a) ?? '').localeCompare(getRegistrationClass(b) ?? '')

export const sortRegistrationsByDateClassTimeAndNumber = <T extends SortableRegistration>(a: T, b: T): number =>
  sortableDate(a.group?.date) === sortableDate(b.group?.date)
    ? byClassTimeAndNumber(a, b)
    : sortableDate(a.group?.date).localeCompare(sortableDate(b.group?.date))

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
  return `${GROUP_KEY_RESERVE}-${classOrType}`
}

export const getRegistrationGroupKey = <T extends JsonRegistration | Registration>(
  reg: Pick<T, 'cancelled' | 'group'>
) => {
  if (reg.cancelled) {
    return GROUP_KEY_CANCELLED
  }
  return reg.group?.key ?? GROUP_KEY_RESERVE
}

export const isParticipantGroup = (group?: string): boolean =>
  Boolean(group) && group !== GROUP_KEY_RESERVE && group !== GROUP_KEY_CANCELLED

/**
 * Whether a result can be recorded for this entry at all. Only the dogs that actually ran are scored: a
 * reserve never called up and a cancelled entry have no round to record, and offering them a row invites
 * a result being entered against the wrong dog.
 */
export const isScorableRegistration = <T extends JsonRegistration | Registration>(
  reg: Pick<T, 'cancelled' | 'group'>
): boolean => isParticipantGroup(getRegistrationGroupKey(reg))

export const canRefund = <T extends JsonRegistration | Registration>(
  reg: Pick<T, 'cancelled' | 'group' | 'paidAmount' | 'refundAmount' | 'refundHandlingCost'>
): boolean =>
  (reg.paidAmount ?? 0) > (reg.refundAmount ?? 0) + (reg.refundHandlingCost ?? 0) &&
  REFUNDABLE_GROUP_KEYS.has(getRegistrationGroupKey(reg))

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
type InvitationAttachmentRegistration = Pick<
  JsonRegistration | Registration,
  'class' | 'eventType' | 'invitationAttachmentRead' | 'invitationAttachmentSent' | 'invitationRead' | 'messagesSent'
>

type InvitationReadStatus = 'not-sent' | 'unread' | 'read-latest' | 'read-previous'

export const getInvitationReadStatus = (
  registration: Pick<
    JsonRegistration | Registration,
    'invitationAttachmentRead' | 'invitationAttachmentSent' | 'invitationRead' | 'messagesSent'
  >
): InvitationReadStatus => {
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

interface RegistrationEmailTemplateOptions {
  previousGroup?: JsonRegistrationGroup
  editToken?: string
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
  const { editToken, previousGroup } = options
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
  const qualifyingResults = registration.qualifyingResults.map((r) => ({
    ...r,
    date: t('dateFormat.date', { date: r.date }),
  }))
  const delayedPayment = confirmedEvent.paymentTime === 'confirmation'

  // Group information. Use previous group when provided.
  const group = previousGroup ?? registration.group
  const groupDate = group?.date ? t('dateFormat.wdshort', { date: group.date }) : ''
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
    invitationAttachment: getCurrentInvitationAttachment(confirmedEvent, registration),
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
    paymentLink,
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
