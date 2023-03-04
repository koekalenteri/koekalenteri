import i18next from 'i18next'
import { useSetRecoilState } from 'recoil'

import { getOfficials } from '../../../../api/official'

import { officialsAtom } from './atoms'

export const useOfficialsActions = () => {
  const setOfficials = useSetRecoilState(officialsAtom)

  return {
    refresh,
  }

  function refresh() {
    getOfficials(true).then((officials) => {
      const sortedOfficials = [...officials].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
      setOfficials(sortedOfficials)
    })
  }
}
