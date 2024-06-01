import type { JsonRegistration, PublicDogEvent, Registration } from '../types'

import { PRIORITY_INVITED, PRIORITY_MEMBER } from './priority'

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
