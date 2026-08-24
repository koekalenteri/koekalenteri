import type { UserWithRoles } from '../../../types'
import i18next from 'i18next'
import { atom } from 'jotai'
import { unwrap } from 'jotai/utils'
import { unique } from '../../../lib/utils'
import { userAtom } from '../../state'
import { adminEventOrganizerIdAtom } from './events/atoms'
import { adminEventOrganizersAtom, adminFilteredEventsAtom } from './events/derivedAtoms'
import { adminOrganizerFilterAtom, adminOrganizersAtom, adminShowOnlyOrganizersWithUsersAtom } from './organizers/atoms'
import { adminUsersAtom } from './user/atoms'

export const adminUsersOrganizersAtom = atom(async (get) => {
  const [users, organizers] = await Promise.all([get(adminUsersAtom), get(adminOrganizersAtom)])
  const organizerIds = unique(
    users.filter((user): user is UserWithRoles => !!user.roles).flatMap((user) => Object.keys(user.roles))
  )

  const filteredOrganizers = organizers.filter((organizer) => organizerIds.includes(organizer.id))
  organizerIds
    .filter((id) => !filteredOrganizers.some((organizer) => organizer.id === id))
    .forEach((id) => {
      filteredOrganizers.push({ id, name: `(tuntematon/poistettu yhdistys: ${id})` })
    })

  return filteredOrganizers
})

export const adminUserOrganizersAtom = atom(async (get) => {
  const user = await get(userAtom)
  const organizers = await get(adminOrganizersAtom)

  return user?.admin
    ? organizers.filter((organizer) => organizer.paytrailMerchantId)
    : organizers.filter((organizer) => user?.roles?.[organizer.id])
})

export const adminUserEventOrganizersAtom = atom(async (get) => {
  const user = await get(userAtom)
  const organizers = await get(adminEventOrganizersAtom)

  return user?.admin ? organizers : organizers.filter((organizer) => user?.roles?.[organizer.id])
})

export const adminUserAdminOrganizersAtom = atom(async (get) => {
  const user = await get(userAtom)
  const organizers = await get(adminOrganizersAtom)

  return user?.admin ? organizers : organizers.filter((organizer) => user?.roles?.[organizer.id] === 'admin')
})

// unwrap keeps serving the previous list synchronously while a new filter/data promise settles,
// instead of re-suspending (and remounting the page) on every filter keystroke.
export const adminUserFilteredEventsAtom = unwrap(
  atom(async (get) => {
    const user = await get(userAtom)
    const events = await get(adminFilteredEventsAtom)
    const organizerId = get(adminEventOrganizerIdAtom)
    const userEvents = user?.admin ? events : events.filter((event) => user?.roles?.[event.organizer.id])

    return organizerId ? userEvents.filter((event) => event.organizer.id === organizerId) : userEvents
  }),
  (prev) => prev ?? []
)

export const adminFilteredOrganizersAtom = unwrap(
  atom(async (get) => {
    const filter = get(adminOrganizerFilterAtom).toLocaleLowerCase(i18next.language)
    const organizers = await get(adminOrganizersAtom)
    const onlyWithUsers = get(adminShowOnlyOrganizersWithUsersAtom)
    const users = onlyWithUsers ? await get(adminUsersAtom) : []
    const organizerIds = unique(users.flatMap((user) => Object.keys(user.roles ?? {}))).filter(Boolean)

    const result = organizerIds.length
      ? organizers.filter((organizer) => organizerIds.includes(organizer.id))
      : organizers

    return filter
      ? result.filter((organizer) => organizer.name.toLocaleLowerCase(i18next.language).includes(filter))
      : result
  }),
  (prev) => prev ?? []
)
