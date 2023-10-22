import type { EmailTemplate } from '../../../../types'

import { selectorFamily } from 'recoil'

import { emailTemplatesAtom } from './atoms'

export const templateSelector = selectorFamily<EmailTemplate | undefined, string | undefined>({
  key: 'templateSelector',
  get:
    (templateId) =>
    ({ get }) => {
      if (!templateId) {
        return undefined
      }
      const templates = get(emailTemplatesAtom)
      return templates.find((i) => i.id === templateId)
    },
})
