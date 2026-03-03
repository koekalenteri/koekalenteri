import type { Registration } from '../../../../types'
import { atomFamily } from 'recoil'
import { logEffect, sessionStorageEffect } from '../../../recoil'
import { adminEventRegistrationSelector } from './selectors'

export const adminEditableEventRegistrationByEventIdAndIdAtom = atomFamily<
  Registration | undefined,
  { eventId: string; id: string }
>({
  default: adminEventRegistrationSelector,
  effects: [logEffect, sessionStorageEffect],
  key: 'adminEditableEventRegistration/eventId+Id',
})
