import type { EmailTemplate } from '../../../../types'

import { atom, atomFamily } from 'recoil'

import { logEffect, sessionStorageEffect } from '../../../recoil/effects'

import { adminRemoteEmailTemplatesEffect } from './effects'
import { adminEmailTemplateSelector } from './selectors'

export const adminEmailTemplatesAtom = atom<EmailTemplate[]>({
  key: 'adminEmailTemplates',
  default: [],
  effects: [logEffect, sessionStorageEffect, adminRemoteEmailTemplatesEffect],
})

export const adminEditableTemplateByIdAtom = atomFamily<EmailTemplate | undefined, string | undefined>({
  key: 'adminEditableEmailTemplate/Id',
  default: adminEmailTemplateSelector,
  effects: [logEffect, sessionStorageEffect],
})
