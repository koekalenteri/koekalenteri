import { User, UserRole } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import { putAdmin, putRole } from '../../../../api/user'
import { idTokenSelector } from '../../../recoil'

import { adminUsersAtom } from './atoms'

export const useAdminUserActions = () => {
  const token = useRecoilValue(idTokenSelector)
  const [users, setUsers] = useRecoilState(adminUsersAtom)

  const replaceUser = (user: User) => {
    const oldIndex = users.findIndex((u) => u.id === user.id)
    const newUsers = [...users]
    newUsers.splice(oldIndex === -1 ? users.length : oldIndex, oldIndex === -1 ? 0 : 1, user)
    setUsers(newUsers)
  }

  return {
    addRole: async (user: User, orgId: string, role: UserRole) => {
      const saved = await putRole({ userId: user.id, orgId, role }, token)
      replaceUser(saved)
    },
    clear: () => setUsers([]), // placeholder for real actions
    deleteCurrent: () => null,
    removeRole: async (user: User, orgId: string) => {
      const saved = await putRole({ userId: user.id, orgId, role: 'none' }, token)
      replaceUser(saved)
    },
    setAdmin: async (user: User): Promise<User> => {
      const saved = await putAdmin({ userId: user.id, admin: !!user.admin }, token)

      replaceUser(saved)

      return saved
    },
  }
}
