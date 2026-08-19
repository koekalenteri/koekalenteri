import type { Organizer } from '../../../../types'
import { useAtom, useAtomValue } from 'jotai'
import { getAdminOrganizers, putOrganizer } from '../../../../api/organizer'
import { compareByLocalizedString } from '../../../../lib/client/sort'
import { validIdTokenAtom } from '../../../state'
import { adminOrganizersAtom } from './atoms'

export const useAdminOrganizersActions = () => {
  const [organizers, setOrganizers] = useAtom(adminOrganizersAtom)
  const token = useAtomValue(validIdTokenAtom)

  return {
    refresh,
    save,
  }

  function refresh() {
    if (!token) throw new Error('missing token')
    getAdminOrganizers(token, true).then((organizers) => {
      setOrganizers([...organizers].sort(compareByLocalizedString('name')))
    })
  }

  async function save(organizer: Organizer) {
    if (!token) throw new Error('missing token')
    const saved = await putOrganizer(organizer, token)

    setOrganizers([...organizers.filter((o) => o.id !== saved.id), saved].sort(compareByLocalizedString('name')))
  }
}
