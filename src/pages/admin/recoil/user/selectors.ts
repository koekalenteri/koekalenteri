import type { User, UserWithRoles } from '../../../../types'

import i18next from 'i18next'
import { selector, selectorFamily, waitForAll } from 'recoil'

import { unique } from '../../../../lib/utils'
import { adminUserOrgIdsSelector, isAdminSelector, userSelector } from '../../../recoil'
import { adminEventOrganizersSelector, adminFilteredEventsSelector } from '../events'
import { adminEventOrganizerIdAtom, adminOrganizersAtom, adminUsersOrganizerIdAtom } from '../organizers'

import { adminUserFilterAtom, adminUserIdAtom, adminUsersAtom } from './atoms'

export const adminUsersOrganizersSelector = selector({
  key: 'adminUserOrganizersSelector',
  get: ({ get }) => {
    const [users, orgs] = get(waitForAll([adminUsersAtom, adminOrganizersAtom]))

    const orgIds = unique(users.filter((u): u is UserWithRoles => !!u.roles).flatMap((u) => Object.keys(u.roles)))

    const filteredOrgs = orgs.filter((o) => orgIds.includes(o.id))
    orgIds
      .filter((id) => !filteredOrgs.some((o) => o.id === id))
      .forEach((id) => filteredOrgs.push({ id, name: `(tuntematon/poistettu yhdistys: ${id})` }))

    return filteredOrgs
  },
})

export const adminFilteredUsersSelector = selector({
  key: 'adminFilteredUsers',
  get: ({ get }) => {
    const isAdmin = get(isAdminSelector)
    const filter = get(adminUserFilterAtom).toLocaleLowerCase(i18next.language)
    const users = get(adminUsersAtom)
    const orgIds = get(adminUserOrgIdsSelector)
    const orgId = get(adminUsersOrganizerIdAtom)

    let result = isAdmin
      ? users
      : users.filter((u) => u.roles && Object.keys(u.roles).some((id) => orgIds.includes(id)))

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

const adminUserSelector = selectorFamily<User | undefined, string | undefined>({
  key: 'adminUserSelector',
  get:
    (userId) =>
    ({ get }) => {
      const events = get(adminUsersAtom)
      return events.find((e) => e.id === userId)
    },
})

export const adminCurrentUserSelector = selector({
  key: 'adminCurrentAdminUser',
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

export const adminUserFilteredEventsSelector = selector({
  key: 'adminUserFilteredEvents',
  get: ({ get }) => {
    const user = get(userSelector)
    const events = get(adminFilteredEventsSelector)
    const orgId = get(adminEventOrganizerIdAtom)
    const userEvents = user?.admin ? events : events.filter((e) => user?.roles?.[e.organizer.id])

    return orgId ? userEvents.filter((e) => e.organizer.id === orgId) : userEvents
  },
})
