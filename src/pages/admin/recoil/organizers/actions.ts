import type { Organizer } from '../../../../types'

import i18next from 'i18next'
import { useRecoilState, useRecoilValue } from 'recoil'

import { getAdminOrganizers, putOrganizer } from '../../../../api/organizer'
import { idTokenAtom } from '../../../recoil'

import { adminOrganizersAtom } from './atoms'

const nameSort = (a: Organizer, b: Organizer) => a.name.localeCompare(b.name, i18next.language)

export const useAdminOrganizersActions = () => {
  const [organizers, setOrganizers] = useRecoilState(adminOrganizersAtom)
  const token = useRecoilValue(idTokenAtom)

  return {
    refresh,
    save,
  }

  function refresh() {
    if (!token) throw new Error('missing token')
    getAdminOrganizers(token, true).then((organizers) => {
      setOrganizers([...organizers].sort(nameSort))
    })
  }

  async function save(organizer: Organizer) {
    if (!token) throw new Error('missing token')
    const saved = await putOrganizer(organizer, token)

    setOrganizers([...organizers.filter((o) => o.id !== saved.id), saved].sort(nameSort))
  }
}
