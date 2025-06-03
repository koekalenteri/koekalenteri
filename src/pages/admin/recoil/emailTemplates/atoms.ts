import type { EmailTemplate } from '../../../../types'

import { atom } from 'recoil'

import { logEffect, sessionStorageEffect } from '../../../recoil/effects'

import { adminRemoteEmailTemplatesEffect } from './effects'

export const adminEmailTemplatesAtom = atom<EmailTemplate[]>({
  key: 'adminEmailTemplates',
  default: [],
  effects: [logEffect, sessionStorageEffect, adminRemoteEmailTemplatesEffect],
})
