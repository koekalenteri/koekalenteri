import type { PublicDogEvent, Registration } from '../types'

import { PRIORITY_INVITED, PRIORITY_MEMBER } from './priority'

export const hasPriority = (event: PublicDogEvent, registration: Registration): true | false | 0.5 => {
  if (event.priority?.includes(PRIORITY_MEMBER)) {
    if (registration.handler.membership && registration.owner.membership) return true
    if (registration.handler.membership || registration.owner.membership) return 0.5
  }
  if (event.priority?.includes(PRIORITY_INVITED) && registration.priorityByInvitation) {
    return true
  }
  if (event.priority?.includes(registration.dog.breedCode ?? '')) {
    return true
  }
  return false
}
