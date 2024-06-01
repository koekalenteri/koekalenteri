import type { EmailTemplate } from '../../../../types'

import { selectorFamily } from 'recoil'

import { adminEmailTemplatesAtom } from './atoms'

export const adminEmailTemplateSelector = selectorFamily<EmailTemplate | undefined, string | undefined>({
  key: 'adminEmailTemplateSelector',
  get:
    (templateId) =>
    ({ get }) => {
      if (!templateId) {
        return undefined
      }
      const templates = get(adminEmailTemplatesAtom)
      return templates.find((i) => i.id === templateId)
    },
})
