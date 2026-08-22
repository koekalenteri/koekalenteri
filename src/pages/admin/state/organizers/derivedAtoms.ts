import type { Organizer } from '../../../../types'
import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { adminOrganizerIdAtom, adminOrganizersAtom } from './atoms'

const adminOrganizerAtom = atomFamily((organizerId: string | undefined) =>
  atom(async (get): Promise<Organizer | undefined> => {
    const events = await get(adminOrganizersAtom)
    return events.find((e) => e.id === organizerId)
  })
)

export const adminCurrentOrganizerAtom = atom(async (get) => {
  const organizerId = get(adminOrganizerIdAtom)
  return organizerId ? await get(adminOrganizerAtom(organizerId)) : undefined
})
