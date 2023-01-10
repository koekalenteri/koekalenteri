import i18next from 'i18next'
import { useSetRecoilState } from 'recoil'

import { getOrganizers } from '../../../../api/organizer'

import { organizersAtom } from './atoms'


export const useOrganizersActions = () => {
  const setOrganizers = useSetRecoilState(organizersAtom)

  return {
    refresh,
  }

  function refresh() {
    getOrganizers(true)
      .then(organizers => {
        const sortedOrganizers = [...organizers].sort((a, b) => a.name.localeCompare(b.name, i18next.language))
        setOrganizers(sortedOrganizers)
      })
  }
}
