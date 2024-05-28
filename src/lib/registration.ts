import type { PublicDogEvent, Registration } from '../types'

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
