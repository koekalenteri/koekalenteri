import type { EmailTemplate } from '../../../../types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { adminEmailTemplatesAtom } from './atoms'

export const adminEmailTemplateAtom = atomFamily((templateId: string | undefined) =>
  atom(async (get): Promise<EmailTemplate | undefined> => {
    if (!templateId) {
      return undefined
    }
    const templates = await get(adminEmailTemplatesAtom)
    return templates.find((i) => i.id === templateId)
  })
)
