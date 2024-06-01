import type { EmailTemplate } from '../../../../types'

import { atom, atomFamily } from 'recoil'

import { localStorageEffect, logEffect } from '../../../recoil/effects'

import { remoteEmailTemplatesEffect } from './effects'
import { templateSelector } from './selectors'

export const emailTemplatesAtom = atom<EmailTemplate[]>({
  key: 'emailTemplates',
  default: [],
  effects: [logEffect, localStorageEffect, remoteEmailTemplatesEffect],
})

export const editableTemplateByIdAtom = atomFamily<EmailTemplate | undefined, string | undefined>({
  key: 'editableEmailTemplate/Id',
  default: templateSelector,
  effects: [logEffect, localStorageEffect],
})
