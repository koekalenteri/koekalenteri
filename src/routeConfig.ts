import type { ConfirmedEvent, PublicDogEvent, Registration } from './types'

import { format } from 'date-fns'

export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? 'http://127.0.0.1:8080'

const ADMIN_ROOT = '/admin'
const ADMIN_EVENTS = `${ADMIN_ROOT}/event`

type RegistrationIds = Pick<Registration, 'eventId' | 'id'>

const isRegistration = (item: ConfirmedEvent | Registration): item is Registration => 'eventId' in item
const getItemDateAndClass = (item: ConfirmedEvent | Registration): string => {
  let date, cls
  if (isRegistration(item)) {
    date = item.dates[0].date
    cls = item.class
  } else {
    date = item.startDate
  }
  const c = cls ? `-${cls}` : ''
  return `${format(date, 'dd.MM.yyyy')}${c}`
}

export const Path = {
  home: '/',
  login: '/login',
  logout: '/logout',
  payment: (registration: RegistrationIds) => `/p/${registration.eventId}/${registration.id}`,
  register: (event: PublicDogEvent, className?: string, classDate?: string) => {
    if (className) {
      return classDate
        ? `/event/${event.eventType}/${event.id}/${className}/${classDate}`
        : `/event/${event.eventType}/${event.id}/${className}`
    }
    return `/event/${event.eventType}/${event.id}`
  },
  registration: (registration: RegistrationIds) => `/r/${registration.eventId}/${registration.id}`,
  registrationOk: (registration: RegistrationIds) => `/r/${registration.eventId}/${registration.id}/saved`,
  invitation: (registration: RegistrationIds) => `/r/${registration.eventId}/${registration.id}/invitation`,
  invitationAttachment: (item: ConfirmedEvent | Registration) =>
    `${API_BASE_URL}/file/${item.invitationAttachment}/kutsu-${item.eventType}-${getItemDateAndClass(item)}.pdf`,
  startList: (id: string = ':id') => `/startlist/${id}`,
  admin: {
    root: ADMIN_ROOT,
    index: `${ADMIN_EVENTS}`,

    events: `${ADMIN_EVENTS}`,
    newEvent: `${ADMIN_EVENTS}/create`,
    editEvent: (id: string = ':id') => `${ADMIN_EVENTS}/edit/${id}`,
    viewEvent: (id: string = ':id') => `${ADMIN_EVENTS}/view/${id}`,
    startList: (id: string = ':id') => `${ADMIN_EVENTS}/startlist/${id}`,

    orgs: `${ADMIN_ROOT}/organizations`,
    users: `${ADMIN_ROOT}/users`,
    officials: `${ADMIN_ROOT}/officials`,
    judges: `${ADMIN_ROOT}/judge`,
    eventTypes: `${ADMIN_ROOT}/types`,
    emailTemplates: `${ADMIN_ROOT}/templates`,
  },
}
