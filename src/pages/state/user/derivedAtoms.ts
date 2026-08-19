import { atom } from 'jotai'
import { getCurrentUser } from '../../../lib/client/currentUser'
import { reportError } from '../../../lib/client/error'
import { isValidIdToken } from '../../../lib/token'
import { userHasAdminAccess } from '../../../lib/user'
import { idTokenAtom, tokenValidityRevisionAtom, userRefreshAtom } from './atoms'

export const validIdTokenAtom = atom((get) => {
  get(tokenValidityRevisionAtom)
  const token = get(idTokenAtom)
  return token && isValidIdToken(token) ? token : undefined
})

export const userAtom = atom(async (get) => {
  const token = await get(validIdTokenAtom)
  const refresh = get(userRefreshAtom)
  if (!token) return null
  try {
    return await getCurrentUser(token, refresh)
  } catch (error) {
    reportError(error)
    return null
  }
})

export const isAdminAtom = atom(async (get) => (await get(userAtom))?.admin === true)
export const isOrgAdminAtom = atom(async (get) => {
  const user = await get(userAtom)
  const roles = user?.roles ?? {}
  return user?.admin === true || Object.keys(roles).some((key) => roles[key] === 'admin')
})
export const hasAdminAccessAtom = atom(async (get) => userHasAdminAccess(await get(userAtom)))
export const adminUserOrgIdsAtom = atom(async (get) => Object.keys((await get(userAtom))?.roles ?? {}))
