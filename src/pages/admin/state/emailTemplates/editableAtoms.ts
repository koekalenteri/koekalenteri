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
    // Only await the initial hydration from adminEmailTemplateAtom. Once storedAtom holds a
    // value, read synchronously instead of via an `async` getter: an async function always
    // returns a new Promise identity on every call, and since storedAtom changes on every
    // keystroke while editing, that would make Suspense re-throw (and remount the whole page)
    // on every keystroke.
    (get) => {
      const stored = get(storedAtom)
      return stored ?? get(adminEmailTemplateAtom(templateId))
    },
    (_get, set, value: EmailTemplate | typeof RESET) => set(storedAtom, value)
  )
})
