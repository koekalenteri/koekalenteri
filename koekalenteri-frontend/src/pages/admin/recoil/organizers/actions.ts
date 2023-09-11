import i18next from 'i18next'
import { useRecoilValue, useSetRecoilState } from 'recoil'

import { getAdminOrganizers } from '../../../../api/organizer'
import { idTokenAtom } from '../../../recoil'

import { adminOrganizersAtom } from './atoms'

export const useOrganizersActions = () => {
  const setOrganizers = useSetRecoilState(adminOrganizersAtom)
  const token = useRecoilValue(idTokenAtom)

  return {
    refresh,
  }

  function refresh() {
    getAdminOrganizers(true, token).then((organizers) => {
      const sortedOrganizers = [...organizers].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
      setOrganizers(sortedOrganizers)
    })
  }
}
