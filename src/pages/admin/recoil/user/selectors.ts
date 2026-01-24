import type { User, UserWithRoles } from '../../../../types'
import i18next from 'i18next'
import { selector, selectorFamily, waitForAll } from 'recoil'
import { unique } from '../../../../lib/utils'
import { adminUserOrgIdsSelector, isAdminSelector, userSelector } from '../../../recoil'
import { adminEventOrganizersSelector, adminFilteredEventsSelector } from '../events'
import { adminEventOrganizerIdAtom, adminOrganizersAtom, adminUsersOrganizerIdAtom } from '../organizers'
import { adminUserFilterAtom, adminUserIdAtom, adminUsersAtom } from './atoms'

export const adminUsersOrganizersSelector = selector({
  get: ({ get }) => {
    const [users, orgs] = get(waitForAll([adminUsersAtom, adminOrganizersAtom]))

    const orgIds = unique(users.filter((u): u is UserWithRoles => !!u.roles).flatMap((u) => Object.keys(u.roles)))

    const filteredOrgs = orgs.filter((o) => orgIds.includes(o.id))
    orgIds
      .filter((id) => !filteredOrgs.some((o) => o.id === id))
      .map((id) => filteredOrgs.push({ id, name: `(tuntematon/poistettu yhdistys: ${id})` }))

    return filteredOrgs
  },
  key: 'adminUserOrganizersSelector',
})

export const adminFilteredUsersSelector = selector({
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
  key: 'adminFilteredUsers',
})

const adminUserSelector = selectorFamily<User | undefined, string | undefined>({
  get:
    (userId) =>
    ({ get }) => {
      const events = get(adminUsersAtom)
      return events.find((e) => e.id === userId)
    },
  key: 'adminUserSelector',
})

export const adminCurrentUserSelector = selector({
  get: ({ get }) => {
    const userId = get(adminUserIdAtom)
    return userId ? get(adminUserSelector(userId)) : undefined
  },
  key: 'adminCurrentAdminUser',
})

export const adminUserOrganizersSelector = selector({
  get: ({ get }) => {
    const user = get(userSelector)
    const list = get(adminOrganizersAtom)

    return user?.admin ? list.filter((o) => o.paytrailMerchantId) : list.filter((o) => user?.roles?.[o.id])
  },
  key: 'adminUserOrganizers',
})

export const adminUserEventOrganizersSelector = selector({
  get: ({ get }) => {
    const user = get(userSelector)
    const list = get(adminEventOrganizersSelector)

    return user?.admin ? list : list.filter((o) => user?.roles?.[o.id])
  },
  key: 'adminUserEventOrganizers',
})

export const adminUserAdminOrganizersSelector = selector({
  get: ({ get }) => {
    const user = get(userSelector)
    const organizers = get(adminOrganizersAtom)

    return user?.admin ? organizers : organizers.filter((o) => user?.roles?.[o.id] === 'admin')
  },
  key: 'adminUserAdminOrganizers',
})

export const adminUserFilteredEventsSelector = selector({
  get: ({ get }) => {
    const user = get(userSelector)
    const events = get(adminFilteredEventsSelector)
    const orgId = get(adminEventOrganizerIdAtom)
    const userEvents = user?.admin ? events : events.filter((e) => user?.roles?.[e.organizer.id])

    return orgId ? userEvents.filter((e) => e.organizer.id === orgId) : userEvents
  },
  key: 'adminUserFilteredEvents',
})
