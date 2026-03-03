import type { User, UserRole } from '../../../../types'

import { useSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue } from 'recoil'

import { putAdmin, putRole, putUser } from '../../../../api/user'
import { reportError } from '../../../../lib/client/error'
import { accessTokenAtom } from '../../../recoil'
import { adminOrganizersAtom } from '../organizers'

import { adminUsersAtom } from './atoms'

export const useAdminUserActions = () => {
  const token = useRecoilValue(accessTokenAtom)
  const { enqueueSnackbar } = useSnackbar()
  const [users, setUsers] = useRecoilState(adminUsersAtom)
  const orgs = useRecoilValue(adminOrganizersAtom)

  const replaceUser = (user: User) => {
    const oldIndex = users.findIndex((u) => u.id === user.id)
    const newUsers = [...users]
    newUsers.splice(oldIndex === -1 ? users.length : oldIndex, oldIndex === -1 ? 0 : 1, user)
    setUsers(newUsers)
  }

  return {
    addUser: async (user: User) => {
      try {
        const added = await putUser(user, token)
        replaceUser(added)
        if (user.name === added.name) {
          enqueueSnackbar(`Käyttäjä '${added.name}' lisätty, sähköpostilla '${added.email}'`, { variant: 'info' })
        } else {
          const orgId = Object.keys(user.roles ?? {})[0]
          const org = orgs.find((o) => o.id === orgId)
          enqueueSnackbar(`Käyttäjälle '${added.name}' ('${added.email}') lisätty oikeus yhdistykseen '${org?.name}'`, {
            variant: 'info',
          })
        }
      } catch (e) {
        reportError(e)
      }
    },
    addRole: async (user: User, orgId: string, role: UserRole) => {
      try {
        const saved = await putRole({ userId: user.id, orgId, role }, token)
        replaceUser(saved)
      } catch (e) {
        reportError(e)
      }
    },
    removeRole: async (user: User, orgId: string) => {
      try {
        const saved = await putRole({ userId: user.id, orgId, role: 'none' }, token)
        replaceUser(saved)
      } catch (e) {
        reportError(e)
      }
    },
    setAdmin: async (user: User) => {
      try {
        const saved = await putAdmin({ userId: user.id, admin: !!user.admin }, token)
        replaceUser(saved)
      } catch (e) {
        reportError(e)
      }
    },
  }
}
