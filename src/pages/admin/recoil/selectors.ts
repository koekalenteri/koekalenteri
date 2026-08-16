import type { UserWithRoles } from '../../../types'
import i18next from 'i18next'
import { selector, waitForAll } from 'recoil'
import { unique } from '../../../lib/utils'
import { userSelector } from '../../recoil'
import { adminEventOrganizerIdAtom } from './events/atoms'
import { adminEventOrganizersSelector, adminFilteredEventsSelector } from './events/selectors'
import { adminOrganizerFilterAtom, adminOrganizersAtom, adminShowOnlyOrganizersWithUsersAtom } from './organizers/atoms'
import { adminUsersAtom } from './user/atoms'

export const adminUsersOrganizersSelector = selector({
  get: ({ get }) => {
    const [users, organizers] = get(waitForAll([adminUsersAtom, adminOrganizersAtom]))
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
  },
  key: 'adminUserOrganizersSelector',
})

export const adminUserOrganizersSelector = selector({
  get: ({ get }) => {
    const user = get(userSelector)
    const organizers = get(adminOrganizersAtom)

    return user?.admin
      ? organizers.filter((organizer) => organizer.paytrailMerchantId)
      : organizers.filter((organizer) => user?.roles?.[organizer.id])
  },
  key: 'adminUserOrganizers',
})

export const adminUserEventOrganizersSelector = selector({
  get: ({ get }) => {
    const user = get(userSelector)
    const organizers = get(adminEventOrganizersSelector)

    return user?.admin ? organizers : organizers.filter((organizer) => user?.roles?.[organizer.id])
  },
  key: 'adminUserEventOrganizers',
})

export const adminUserAdminOrganizersSelector = selector({
  get: ({ get }) => {
    const user = get(userSelector)
    const organizers = get(adminOrganizersAtom)

    return user?.admin ? organizers : organizers.filter((organizer) => user?.roles?.[organizer.id] === 'admin')
  },
  key: 'adminUserAdminOrganizers',
})

export const adminUserFilteredEventsSelector = selector({
  get: ({ get }) => {
    const user = get(userSelector)
    const events = get(adminFilteredEventsSelector)
    const organizerId = get(adminEventOrganizerIdAtom)
    const userEvents = user?.admin ? events : events.filter((event) => user?.roles?.[event.organizer.id])

    return organizerId ? userEvents.filter((event) => event.organizer.id === organizerId) : userEvents
  },
  key: 'adminUserFilteredEvents',
})

export const adminFilteredOrganizersSelector = selector({
  get: ({ get }) => {
    const filter = get(adminOrganizerFilterAtom).toLocaleLowerCase(i18next.language)
    const organizers = get(adminOrganizersAtom)
    const onlyWithUsers = get(adminShowOnlyOrganizersWithUsersAtom)
    const users = onlyWithUsers ? get(adminUsersAtom) : []
    const organizerIds = unique(users.flatMap((user) => Object.keys(user.roles ?? {}))).filter(Boolean)

    const result = organizerIds.length
      ? organizers.filter((organizer) => organizerIds.includes(organizer.id))
      : organizers

    return filter
      ? result.filter((organizer) => organizer.name.toLocaleLowerCase(i18next.language).includes(filter))
      : result
  },
  key: 'adminFilteredOrganizers',
})
