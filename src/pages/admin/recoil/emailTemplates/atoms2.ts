import type { EmailTemplate } from '../../../../types'

import { atomFamily } from 'recoil'

import { logEffect, sessionStorageEffect } from '../../../recoil'

import { adminEmailTemplateSelector } from './selectors'

export const adminEditableTemplateByIdAtom = atomFamily<EmailTemplate | undefined, string | undefined>({
  key: 'adminEditableEmailTemplate/Id',
  default: adminEmailTemplateSelector,
  effects: [logEffect, sessionStorageEffect],
})
