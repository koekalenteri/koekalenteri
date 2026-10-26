import type { User } from '@/types'
import { atom } from 'jotai'
import { getCurrentUser } from '@/lib/client/currentUser'
import { reportError } from '@/lib/client/error'
import { asSettled, mapMaybe } from '@/lib/maybePromise'
import { isValidIdToken } from '@/lib/token'
import { userHasAdminAccess } from '@/lib/user'
import { loadedAtom } from '../loadedAtom'
import { idTokenAtom, tokenValidityRevisionAtom, userRefreshAtom } from './atoms'

export const validIdTokenAtom = atom((get) => {
  get(tokenValidityRevisionAtom)
  const token = get(idTokenAtom)
  return token && isValidIdToken(token) ? token : undefined
})

const remoteUserAtom = atom(async (get): Promise<User | null> => {
  const token = get(validIdTokenAtom)
  const refresh = get(userRefreshAtom)
  if (!token) return null
  try {
    return await getCurrentUser(token, refresh)
  } catch (error) {
    reportError(error)
    return null
  }
})

// Served through loadedAtom: a refreshed id token or a forced refresh must not suspend the admin
// shell, which reads the user above every admin page's Suspense boundary. None of the derived
// atoms below is an `async` getter either, for the same reason.
const loadedUserAtom = loadedAtom(remoteUserAtom)

export const userAtom = atom((get) => asSettled(get(loadedUserAtom)))

export const isAdminAtom = atom((get) => mapMaybe(get(userAtom), (user) => user?.admin === true))
export const isOrgAdminAtom = atom((get) =>
  mapMaybe(get(userAtom), (user) => {
    const roles = user?.roles ?? {}
    return user?.admin === true || Object.keys(roles).some((key) => roles[key] === 'admin')
  })
)
export const hasAdminAccessAtom = atom((get) => mapMaybe(get(userAtom), userHasAdminAccess))
export const adminUserOrgIdsAtom = atom((get) => mapMaybe(get(userAtom), (user) => Object.keys(user?.roles ?? {})))
