import type { Registration } from '../../../../types'

import { atomFamily } from 'recoil'

import { logEffect, sessionStorageEffect } from '../../../recoil'

import { adminEventRegistrationSelector } from './selectors'

export const adminEditableEventRegistrationByEventIdAndIdAtom = atomFamily<
  Registration | undefined,
  { eventId: string; id: string }
>({
  key: 'adminEditableEventRegistration/eventId+Id',
  default: adminEventRegistrationSelector,
  effects: [logEffect, sessionStorageEffect],
})
