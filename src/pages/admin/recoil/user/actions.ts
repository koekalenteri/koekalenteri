import type { User, UserRole } from '../../../../types'

import { useSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue } from 'recoil'

import { putAdmin, putRole, putUser } from '../../../../api/user'
import { idTokenAtom } from '../../../recoil'
import { adminOrganizersAtom } from '../organizers'

import { adminUsersAtom } from './atoms'

export const useAdminUserActions = () => {
  const token = useRecoilValue(idTokenAtom)
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
        if (user.name !== added.name) {
          const orgId = Object.keys(user.roles ?? {})[0]
          const org = orgs.find((o) => o.id === orgId)
          enqueueSnackbar(`Käyttäjälle '${added.name}' ('${added.email}') lisätty oikeus yhdistykseen '${org?.name}'`, {
            variant: 'info',
          })
        } else {
          enqueueSnackbar(`Käyttäjä '${added.name}' lisätty, sähköpostilla '${added.email}'`, { variant: 'info' })
        }
      } catch (e) {
        console.error(e)
      }
    },
    addRole: async (user: User, orgId: string, role: UserRole) => {
      try {
        const saved = await putRole({ userId: user.id, orgId, role }, token)
        replaceUser(saved)
      } catch (e) {
        console.error(e)
      }
    },
    removeRole: async (user: User, orgId: string) => {
      try {
        const saved = await putRole({ userId: user.id, orgId, role: 'none' }, token)
        replaceUser(saved)
      } catch (e) {
        console.error(e)
      }
    },
    setAdmin: async (user: User) => {
      try {
        const saved = await putAdmin({ userId: user.id, admin: !!user.admin }, token)
        replaceUser(saved)
      } catch (e) {
        console.error(e)
      }
    },
  }
}
