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

const REFUNDABLE_GROUP_KEYS = [GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE]

type RegistrationPriorityFields = Pick<Registration, 'priorityByInvitation'> & {
  owner?: Pick<Registration['owner'], 'membership'>
  handler?: Pick<Registration['handler'], 'membership'>
  dog?: Pick<Registration['dog'], 'breedCode'>
}

export const hasPriority = (
  event: Pick<PublicDogEvent, 'priority'>,
  registration: RegistrationPriorityFields
): true | false | 0.5 => {
  if (event.priority?.includes(PRIORITY_MEMBER)) {
    if (registration.handler?.membership && registration.owner?.membership) return true
    if (registration.handler?.membership || registration.owner?.membership) return 0.5
  }
  if (event.priority?.includes(PRIORITY_INVITED) && registration.priorityByInvitation) {
    return true
  }
  if (registration.dog?.breedCode && event.priority?.includes(registration.dog.breedCode)) {
    return true
  }
  return false
}

const byTimeAndNumber = <T extends JsonRegistration>(a: T, b: T): number =>
  a.group?.time === b.group?.time
    ? (a.group?.number ?? 999) - (b.group?.number ?? 999)
    : (a.group?.time ?? '').localeCompare(b.group?.time ?? '')

const byClassTimeAndNumber = <T extends JsonRegistration>(a: T, b: T): number =>
  a.class === b.class ? byTimeAndNumber(a, b) : (a.class ?? '').localeCompare(b.class ?? '')

export const sortRegistrationsByDateClassTimeAndNumber = <T extends JsonRegistration>(a: T, b: T): number =>
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
