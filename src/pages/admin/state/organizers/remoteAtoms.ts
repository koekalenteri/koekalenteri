import type { Organizer } from '../../../../types'
import { atom } from 'jotai'
import { getAdminOrganizers } from '../../../../api/organizer'
import { compareByLocalizedString } from '../../../../lib/client/sort'
import { validIdTokenAtom } from '../../../state'

const remoteOrganizersAtom = atom(async (get) => {
  const token = await get(validIdTokenAtom)
  if (!token) return []
  const organizers = await getAdminOrganizers(token)
  return [...organizers].sort(compareByLocalizedString('name'))
})
const organizersOverrideAtom = atom<Organizer[] | undefined>(undefined)
export const adminOrganizersRemoteAtom = atom(
  (get) => get(organizersOverrideAtom) ?? get(remoteOrganizersAtom),
  (_get, set, value: Organizer[]) => set(organizersOverrideAtom, value)
)
