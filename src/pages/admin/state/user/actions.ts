import type { User, UserRole } from '../../../../types'
import { useAtom, useAtomValue } from 'jotai'
import { useAtomCallback } from 'jotai/utils'
import { useSnackbar } from 'notistack'
import { useCallback } from 'react'
import { getUsers, putAdmin, putRole, putUser } from '../../../../api/user'
import { reportError } from '../../../../lib/client/error'
import { collectionSince, reconcileCollection } from '../../../../lib/incremental'
import { validIdTokenAtom } from '../../../state'
import { adminUsersAtom } from './atoms'

export const useAdminUserActions = () => {
  const token = useAtomValue(validIdTokenAtom)
  const { enqueueSnackbar } = useSnackbar()
  const [users, setUsers] = useAtom(adminUsersAtom)

  const replaceUser = (user: User) => {
    const oldIndex = users.findIndex((u) => u.id === user.id)
    const newUsers = [...users]
    newUsers.splice(oldIndex === -1 ? users.length : oldIndex, oldIndex === -1 ? 0 : 1, user)
    setUsers(newUsers)
  }

  // Reads the list through the store rather than through `users`, so the callback stays stable and
  // callers can refresh on mount without the refresh itself scheduling the next one.
  const refreshUsers = useAtomCallback(
    useCallback(async (get, set, token: string) => {
      // The cached list is complete up to its own newest timestamp, so only what happened after it
      // has to come over the wire. Without this a mount refresh discards the cache every time.
      const current = await get(adminUsersAtom)
      const since = collectionSince(current)
      const response = since ? await getUsers(token, undefined, since) : await getUsers(token)
      await set(adminUsersAtom, (latest) => reconcileCollection(latest, response))
    }, [])
  )

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      await refreshUsers(token)
    } catch (e) {
      reportError(e)
    }
  }, [token, refreshUsers])

  return {
    addRole: async (user: User, orgId: string, role: UserRole) => {
      try {
        const saved = await putRole({ orgId, role, userId: user.id }, token)
        replaceUser(saved)
      } catch (e) {
        reportError(e)
      }
    },
    addUser: async (user: User, organizerName: string) => {
      try {
        const added = await putUser(user, token)
        replaceUser(added)
        if (user.name === added.name) {
          enqueueSnackbar(`Käyttäjä '${added.name}' lisätty, sähköpostilla '${added.email}'`, { variant: 'info' })
        } else {
          enqueueSnackbar(
            `Käyttäjälle '${added.name}' ('${added.email}') lisätty oikeus yhdistykseen '${organizerName}'`,
            { variant: 'info' }
          )
        }
      } catch (e) {
        reportError(e)
      }
    },
    refresh,
    removeRole: async (user: User, orgId: string) => {
      try {
        const saved = await putRole({ orgId, role: 'none', userId: user.id }, token)
        replaceUser(saved)
      } catch (e) {
        reportError(e)
      }
    },
    setAdmin: async (user: User) => {
      try {
        const saved = await putAdmin({ admin: !!user.admin, userId: user.id }, token)
        replaceUser(saved)
      } catch (e) {
        reportError(e)
      }
    },
  }
}
