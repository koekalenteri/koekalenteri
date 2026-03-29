import i18next from 'i18next'
import { useRecoilValue, useSetRecoilState } from 'recoil'
import { getOfficials } from '../../../../api/official'
import { getUsers } from '../../../../api/user'
import { accessTokenAtom } from '../../../recoil'
import { adminUsersAtom } from '../user'
import { adminOfficialsAtom } from './atoms'

export const useAdminOfficialsActions = () => {
  const token = useRecoilValue(accessTokenAtom)
  const setOfficials = useSetRecoilState(adminOfficialsAtom)
  const setUsers = useSetRecoilState(adminUsersAtom)

  const refresh = async () => {
    if (!token) throw new Error('missing token')
    const officials = await getOfficials(token, true)
    const users = await getUsers(token)
    const sortedOfficials = [...officials].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
    setOfficials(sortedOfficials)
    setUsers(users)
  }

  return {
    refresh,
  }
}
