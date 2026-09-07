import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { findInCollection } from '../cached/createCachedRemoteCollection'
import { adminEmailTemplatesAtom } from './atoms'

// Not an `async` getter: that returns a new Promise on the first read of every family member, so
// selecting a template not opened before in the session would suspend the templates page and swap
// it for the admin-wide Suspense fallback, even though the list itself has already loaded.
export const adminEmailTemplateAtom = atomFamily((templateId: string | undefined) =>
  atom((get) => (templateId ? findInCollection(get(adminEmailTemplatesAtom), templateId) : undefined))
)
