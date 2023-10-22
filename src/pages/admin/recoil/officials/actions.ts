import i18next from 'i18next'
import { useRecoilValue, useResetRecoilState, useSetRecoilState } from 'recoil'

import { getOfficials } from '../../../../api/official'
import { idTokenAtom } from '../../../recoil'
import { adminUsersAtom } from '../user'

import { officialsAtom } from './atoms'

export const useOfficialsActions = () => {
  const token = useRecoilValue(idTokenAtom)
  const setOfficials = useSetRecoilState(officialsAtom)
  const resetUsers = useResetRecoilState(adminUsersAtom)

  const refresh = async () => {
    const officials = await getOfficials(token, true)
    const sortedOfficials = [...officials].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
    setOfficials(sortedOfficials)
    resetUsers()
  }

  return {
    refresh,
  }
}
