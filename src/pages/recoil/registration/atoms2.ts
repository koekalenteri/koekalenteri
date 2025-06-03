import type { Registration } from '../../../types'

import { atomFamily } from 'recoil'

import { logEffect, sessionStorageEffect } from '../effects'

import { registrationSelector } from './selectors'

export const editableRegistrationByIdsAtom = atomFamily<Registration | undefined | null, string | undefined>({
  key: 'editableRegistration/ids',
  default: registrationSelector,
  effects: [logEffect, sessionStorageEffect],
})
