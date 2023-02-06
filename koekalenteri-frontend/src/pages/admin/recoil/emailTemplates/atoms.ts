
import { EmailTemplate } from 'koekalenteri-shared/model'
import { atom, atomFamily } from 'recoil'

import { logEffect, storageEffect } from '../../../recoil/effects'

import { remoteEmailTemplatesEffect } from './effects'
import { templateSelector } from './selectors'

export const emailTemplatesAtom = atom<EmailTemplate[]>({
  key: 'emailTemplates',
  default: [],
  effects: [
    logEffect,
    storageEffect,
    remoteEmailTemplatesEffect,
  ],
})

export const editableTemplateByIdAtom = atomFamily<EmailTemplate | undefined, string|undefined>({
  key: 'editableEmailTemplate/Id',
  default: templateSelector,
  effects: [
    logEffect,
    storageEffect,
  ],
})
