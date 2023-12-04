import type { User, UserWithRoles } from '../../../../types'

import i18next from 'i18next'
import { selector, selectorFamily } from 'recoil'

import { unique } from '../../../../utils'
import { eventsAtom, userSelector } from '../../../recoil'
import { adminEventOrganizersSelector, filteredAdminEventsSelector } from '../events'
import { adminEventOrganizerIdAtom, adminOrganizersAtom, adminUsersOrganizerIdAtom } from '../organizers'

import { adminUserFilterAtom, adminUserIdAtom, adminUsersAtom } from './atoms'

export const adminUsersOrganizersSelector = selector({
  key: 'adminUserOrganizersSelector',
  get: ({ get }) => {
    const users = get(adminUsersAtom)
    const orgs = get(adminOrganizersAtom)

    const orgIds = unique(users.filter((u): u is UserWithRoles => !!u.roles).flatMap((u) => Object.keys(u.roles)))

    const filteredOrgs = orgs.filter((o) => orgIds.includes(o.id))
    orgIds
      .filter((id) => !filteredOrgs.find((o) => o.id === id))
      .map((id) => filteredOrgs.push({ id, name: `(tuntematon/poistettu yhdistys: ${id})` }))

    return filteredOrgs
  },
})

export const filteredUsersSelector = selector({
  key: 'filteredUsers',
  get: ({ get }) => {
    const filter = get(adminUserFilterAtom).toLocaleLowerCase(i18next.language)
    const users = get(adminUsersAtom)
    const orgId = get(adminUsersOrganizerIdAtom)

    let result = users

    if (orgId) {
      result = result.filter((u) => u.roles?.[orgId])
    }

    if (filter) {
      result = result.filter((user) =>
        [user.id, user.email, user.name, user.location, user.phone]
          .join(' ')
          .toLocaleLowerCase(i18next.language)
          .includes(filter)
      )
    }

    return result
  },
})

export const adminUserSelector = selectorFamily<User | undefined, string | undefined>({
  key: 'adminUserSelector',
  get:
    (userId) =>
    ({ get }) => {
      const events = get(adminUsersAtom)
      return events.find((e) => e.id === userId)
    },
})

export const currentAdminUserSelector = selector({
  key: 'currentAdminUser',
  get: ({ get }) => {
    const userId = get(adminUserIdAtom)
    return userId ? get(adminUserSelector(userId)) : undefined
  },
})

export const adminUserOrganizersSelector = selector({
  key: 'adminUserOrganizers',
  get: ({ get }) => {
    const user = get(userSelector)
    const list = get(adminOrganizersAtom)

    return user?.admin ? list.filter((o) => o.paytrailMerchantId) : list.filter((o) => user?.roles?.[o.id])
  },
})

export const adminUserEventOrganizersSelector = selector({
  key: 'adminUserEventOrganizers',
  get: ({ get }) => {
    const user = get(userSelector)
    const list = get(adminEventOrganizersSelector)

    return user?.admin ? list : list.filter((o) => user?.roles?.[o.id])
  },
})

export const adminUserAdminOrganizersSelector = selector({
  key: 'adminUserAdminOrganizers',
  get: ({ get }) => {
    const user = get(userSelector)
    const organizers = get(adminOrganizersAtom)

    return user?.admin ? organizers : organizers.filter((o) => user?.roles?.[o.id] === 'admin')
  },
})

export const adminUserEventsSelector = selector({
  key: 'adminUserEvents',
  get: ({ get }) => {
    const user = get(userSelector)
    const events = get(eventsAtom)

    return user?.admin ? events : events.filter((e) => user?.roles?.[e.organizer.id])
  },
})

export const adminUserFilteredEventsSelector = selector({
  key: 'adminUserFilteredEvents',
  get: ({ get }) => {
    const user = get(userSelector)
    const events = get(filteredAdminEventsSelector)
    const orgId = get(adminEventOrganizerIdAtom)

    const userEvents = user?.admin ? events : events.filter((e) => user?.roles?.[e.organizer.id])
    return orgId ? userEvents.filter((e) => e.organizer.id === orgId) : userEvents
  },
})
