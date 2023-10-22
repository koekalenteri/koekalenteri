import type { Registration } from '../../../../types'

import { atomFamily } from 'recoil'

import { logEffect, storageEffect } from '../../../recoil'

import { adminEventRegistrationSelector } from './selectors'

export const editableAdminEventRegistrationByEventIdAndIdAtom = atomFamily<
  Registration | undefined,
  { eventId: string; id: string }
>({
  key: 'editableAdminEventRegistration/eventId+Id',
  default: adminEventRegistrationSelector,
  effects: [logEffect, storageEffect],
})
