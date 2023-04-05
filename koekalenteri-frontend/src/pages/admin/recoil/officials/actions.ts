import i18next from 'i18next'
import { useResetRecoilState, useSetRecoilState } from 'recoil'

import { getOfficials } from '../../../../api/official'
import { usersAtom } from '../user'

import { officialsAtom } from './atoms'

export const useOfficialsActions = () => {
  const setOfficials = useSetRecoilState(officialsAtom)
  const resetUsers = useResetRecoilState(usersAtom)

  return {
    refresh,
  }

  function refresh() {
    getOfficials(true).then((officials) => {
      const sortedOfficials = [...officials].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
      setOfficials(sortedOfficials)
      resetUsers()
    })
  }
}
