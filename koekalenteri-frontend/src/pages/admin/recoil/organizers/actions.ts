import i18next from 'i18next'
import { useSetRecoilState } from 'recoil'

import { getAdminOrganizers } from '../../../../api/organizer'

import { adminOrganizersAtom } from './atoms'

export const useOrganizersActions = () => {
  const setOrganizers = useSetRecoilState(adminOrganizersAtom)

  return {
    refresh,
  }

  function refresh() {
    getAdminOrganizers(true).then((organizers) => {
      const sortedOrganizers = [...organizers].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
      setOrganizers(sortedOrganizers)
    })
  }
}
