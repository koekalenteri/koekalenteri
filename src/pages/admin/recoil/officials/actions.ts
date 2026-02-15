import i18next from 'i18next'
import { useRecoilValue, useResetRecoilState, useSetRecoilState } from 'recoil'

import { getOfficials } from '../../../../api/official'
import { accessTokenAtom } from '../../../recoil'
import { adminUsersAtom } from '../user'

import { adminOfficialsAtom } from './atoms'

export const useAdminOfficialsActions = () => {
  const token = useRecoilValue(accessTokenAtom)
  const setOfficials = useSetRecoilState(adminOfficialsAtom)
  const resetUsers = useResetRecoilState(adminUsersAtom)

  const refresh = async () => {
    if (!token) throw new Error('missing token')
    const officials = await getOfficials(token, true)
    const sortedOfficials = [...officials].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
    setOfficials(sortedOfficials)
    resetUsers()
  }

  return {
    refresh,
  }
}
