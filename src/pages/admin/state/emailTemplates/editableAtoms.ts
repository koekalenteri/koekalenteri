import type { RESET } from 'jotai/utils'
import type { EmailTemplate } from '../../../../types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { atomWithSessionStorage } from '../../../state'
import { adminEmailTemplateAtom } from './derivedAtoms'

export const adminEditableTemplateByIdAtom = atomFamily((templateId: string | undefined) => {
  const storedAtom = atomWithSessionStorage<EmailTemplate | undefined>(
    `adminEditableEmailTemplate/Id__${templateId}`,
    undefined
  )
  return atom(
    async (get) => get(storedAtom) ?? (await get(adminEmailTemplateAtom(templateId))),
    async (
      get,
      set,
      value:
        | EmailTemplate
        | undefined
        | typeof RESET
        | ((previous: EmailTemplate | undefined) => EmailTemplate | undefined)
    ) => {
      if (typeof value !== 'function') return set(storedAtom, value)
      return set(storedAtom, value(get(storedAtom) ?? (await get(adminEmailTemplateAtom(templateId)))))
    }
  )
})
