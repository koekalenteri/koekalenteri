import type { TFunction } from 'i18next'
import type {
  DogEvent,
  JsonConfirmedEvent,
  JsonRegistration,
  PublicDogEvent,
  Registration,
  RegistrationTemplateContext,
} from '../types'

import { PRIORITY_INVITED, PRIORITY_MEMBER } from './priority'

export const GROUP_KEY_CANCELLED = 'cancelled'
export const GROUP_KEY_RESERVE = 'reserve'

export const NOME_B_CH_qualification_start_date = new Date('2023-08-17T21:00:00Z') // TODO: get this date from last NOME-B SM event

const REFUNDABLE_GROUP_KEYS = [GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE]

type RegistrationPriorityFields = Pick<Registration, 'priorityByInvitation'> & {
  owner?: Pick<Registration['owner'], 'membership'>
  handler?: Pick<Registration['handler'], 'membership'>
  dog?: Pick<Registration['dog'], 'breedCode'>
  qualifyingResults?: Registration['qualifyingResults'] | JsonRegistration['qualifyingResults']
}

type PriorityCheckFn<T> = (
  event: Partial<Pick<PublicDogEvent, 'eventType' | 'priority'>>,
  registration: RegistrationPriorityFields
) => T

const hasMembershipPriority: PriorityCheckFn<boolean> = (event, registration) =>
  Boolean(
    event.priority?.includes(PRIORITY_MEMBER) && (registration.handler?.membership || registration.owner?.membership)
  )

const hasInvitationPriority: PriorityCheckFn<boolean> = (event, registration) =>
  Boolean(event.priority?.includes(PRIORITY_INVITED) && registration.priorityByInvitation)

const hasBreedPriority: PriorityCheckFn<boolean> = (event, registration) =>
  Boolean(registration.dog?.breedCode && event.priority?.includes(registration.dog.breedCode))

const hasNomeBSMPriority: PriorityCheckFn<false | 'b-sm.2' | 'b-sm.3'> = (event, registration) => {
  if (event.eventType === 'NOME-B SM') {
    const count = registration.qualifyingResults?.reduce((acc, r) => acc + (r.result === 'VOI1' ? 1 : 0), 0) ?? 0
    const kvaDateOrString = registration.qualifyingResults?.find((r) => r.result === 'FI KVA-B')?.date
    const kvaDate = typeof kvaDateOrString === 'string' ? new Date(kvaDateOrString) : kvaDateOrString
    if (count >= 3) return 'b-sm.3'
    if (kvaDate && kvaDate.valueOf() < NOME_B_CH_qualification_start_date.valueOf() && count === 2) return 'b-sm.2'
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

export type SortableRegistration = Pick<JsonRegistration, 'class' | 'group'>

const byTimeAndNumber = <T extends SortableRegistration>(a: T, b: T): number =>
  a.group?.time === b.group?.time
    ? (a.group?.number ?? 999) - (b.group?.number ?? 999)
    : (a.group?.time ?? '').localeCompare(b.group?.time ?? '')

const byClassTimeAndNumber = <T extends SortableRegistration>(a: T, b: T): number =>
  (a.class ?? '') === (b.class ?? '') ? byTimeAndNumber(a, b) : (a.class ?? '').localeCompare(b.class ?? '')

export const sortRegistrationsByDateClassTimeAndNumber = <T extends SortableRegistration>(a: T, b: T): number =>
  a.group?.date === b.group?.date
    ? byClassTimeAndNumber(a, b)
    : (a.group?.date ?? '').localeCompare(b.group?.date ?? '')

export const getRegistrationNumberingGroupKey = <T extends JsonRegistration | Registration>(
  reg: Pick<T, 'cancelled' | 'class' | 'eventType' | 'group'>
) => {
  const classOrType = reg.class ?? reg.eventType
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

export const canRefund = <T extends JsonRegistration | Registration>(
  reg: Pick<T, 'cancelled' | 'group' | 'paidAmount' | 'refundAmount'>
): boolean =>
  (reg.paidAmount ?? 0) > (reg.refundAmount ?? 0) && REFUNDABLE_GROUP_KEYS.includes(getRegistrationGroupKey(reg))

export const getRegistrationEmailTemplateData = (
  registration: JsonRegistration | Registration,
  confirmedEvent: JsonConfirmedEvent | DogEvent,
  origin: string | undefined,
  context: RegistrationTemplateContext,
  text: string | undefined,
  t: TFunction
) => {
  const eventDate = t('dateFormat.datespan', { start: confirmedEvent.startDate, end: confirmedEvent.endDate })
  const reserveText = t(`registration.reserveChoises.${registration.reserve || 'ANY'}`)
  const dogBreed = registration.dog.breedCode ? t(`${registration.dog.breedCode}`, { ns: 'breed' }) : ''
  const regDates = registration.dates
    .map((d) => t('dateFormat.short', { date: d.date }) + (d.time ? ' ' + t(`registration.time.${d.time}`) : ''))
    .join(', ')
  const link = `${origin}/r/${registration.eventId}/${registration.id}`
  const paymentLink = `${origin}/p/${registration.eventId}/${registration.id}`
  const qualifyingResults = registration.qualifyingResults.map((r) => ({
    ...r,
    date: t('dateFormat.date', { date: r.date }),
  }))
  const groupDate = registration.group?.date ? t('dateFormat.wdshort', { date: registration.group.date }) : ''
  const groupTime = registration.group?.time ? t(`registration.timeLong.${registration.group.time}`) : ''
  const invitationLink = `${origin}/r/${registration.eventId}/${registration.id}/invitation`

  return {
    subject: t('registration.email.subject', { context, defaultValue: '' }),
    title: t('registration.email.title', { context, defaultValue: '' }),
    dogBreed,
    link,
    paymentLink,
    event: confirmedEvent,
    eventDate,
    invitationLink,
    qualifyingResults,
    reg: registration,
    regDates,
    reserveText,
    groupDate,
    groupTime,
    text,
  }
}
