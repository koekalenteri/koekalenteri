import i18next from 'i18next'
import { User } from 'koekalenteri-shared/model'
import { selector, selectorFamily } from 'recoil'

import { eventsAtom, userSelector } from '../../../recoil'
import { filteredAdminEventsSelector } from '../events'
import { organizersAtom, selectedOrganizerIdAtom } from '../organizers'

import { adminUserFilterAtom, adminUserIdAtom, adminUsersAtom } from './atoms'

export const filteredUsersSelector = selector({
  key: 'filteredUsers',
  get: ({ get }) => {
    const filter = get(adminUserFilterAtom).toLocaleLowerCase(i18next.language)
    const list = get(adminUsersAtom)

    if (!filter) {
      return list
    }
    return list.filter((user) =>
      [user.id, user.email, user.name, user.location, user.phone]
        .join(' ')
        .toLocaleLowerCase(i18next.language)
        .includes(filter)
    )
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
    const list = get(organizersAtom)

    return user?.admin ? list : list.filter((o) => user?.roles?.[o.id])
  },
})

export const adminUserAdminOrganizersSelector = selector({
  key: 'adminUserAdminOrganizers',
  get: ({ get }) => {
    const user = get(userSelector)
    const list = get(organizersAtom)

    return user?.admin ? list : list.filter((o) => user?.roles?.[o.id] === 'admin')
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
    const orgId = get(selectedOrganizerIdAtom)
    console.log('orgId', orgId)

    const userEvents = user?.admin ? events : events.filter((e) => user?.roles?.[e.organizer.id])
    return orgId ? userEvents.filter((e) => e.organizer.id === orgId) : userEvents
  },
})
