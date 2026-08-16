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
  RegistrationPerson,
  RegistrationTemplateContext,
  RegistrationTime,
} from '../types'
import { nanoid } from 'nanoid'
import { emptyBreeder, emptyDog, emptyPerson } from './data'
import { isEntryClosed } from './event'
import { PRIORITY_INVITED, PRIORITY_MEMBER } from './priority'
import { isDefined } from './typeGuards'
import { isObject } from './utils'

export const GROUP_KEY_CANCELLED = 'cancelled'
export const GROUP_KEY_RESERVE = 'reserve'

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

const REG_CLASSES = new Set<RegistrationClass>(['ALO', 'AVO', 'VOI'])

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
  handler?: Pick<RegistrationPerson, 'membership'>
  dog?: Pick<Registration['dog'], 'breedCode'>
  qualifyingResults?: Registration['qualifyingResults'] | JsonRegistration['qualifyingResults']
}

type PriorityCheckFn<T, E extends PublicDogEvent | JsonPublicDogEvent = PublicDogEvent | JsonPublicDogEvent> = (
  event: Partial<Pick<E, 'eventType' | 'priority' | 'qualificationStartDate'>>,
  registration: RegistrationPriorityFields
) => T

export const isMember = (registration?: MinimalRegistrationForMembership): boolean =>
  Boolean((!registration?.ownerHandles && registration?.handler?.membership) || registration?.owner?.membership)

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
  if (hasMembershipPriority(event, registration)) {
    if (registration.handler?.membership && registration.owner?.membership) return true
    return 0.5
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
