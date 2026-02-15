import type { ConfirmedEvent, PublicDogEvent, Registration, RegistrationClass } from './types'
import { formatDate } from './i18n/dates'

export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? 'http://127.0.0.1:8080'
export const WS_API_URL = process.env.REACT_APP_WS_API_URL ?? 'wss://127.0.0.1'

const ADMIN_ROOT = '/admin'
const ADMIN_EVENTS = `${ADMIN_ROOT}/event`

type RegistrationIds = Pick<Registration, 'eventId' | 'id'>

const isRegistration = (item: ConfirmedEvent | Registration): item is Registration => 'eventId' in item
const getItemDateAndClass = (item: ConfirmedEvent | Registration): string => {
  let date: Date | undefined
  let cls: RegistrationClass | null | undefined
  if (isRegistration(item)) {
    date = item.dates[0].date
    cls = item.class
  } else {
    date = item.startDate
  }
  const c = cls ? `-${cls}` : ''
  return `${formatDate(date, 'dd.MM.yyyy')}${c}`
}

export const Path = {
  admin: {
    editEvent: (id: string = ':id') => `${ADMIN_EVENTS}/edit/${id}`,
    emailTemplates: `${ADMIN_ROOT}/templates`,

    events: `${ADMIN_EVENTS}`,
    eventTypes: `${ADMIN_ROOT}/types`,
    index: `${ADMIN_EVENTS}`,
    judges: `${ADMIN_ROOT}/judge`,
    newEvent: `${ADMIN_EVENTS}/create`,
    officials: `${ADMIN_ROOT}/officials`,

    orgs: `${ADMIN_ROOT}/organizations`,
    root: ADMIN_ROOT,
    startList: (id: string = ':id') => `${ADMIN_EVENTS}/startlist/${id}`,
    users: `${ADMIN_ROOT}/users`,
    viewEvent: (id: string = ':id') => `${ADMIN_EVENTS}/view/${id}`,
  },
  home: '/',
  invitation: (registration: RegistrationIds) => `/r/${registration.eventId}/${registration.id}/invitation`,
  invitationAttachment: (item: ConfirmedEvent | Registration) =>
    `${API_BASE_URL}/file/${item.invitationAttachment}/kutsu-${item.eventType}-${getItemDateAndClass(item)}.pdf`,
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
  startList: (id: string = ':id') => `/startlist/${id}`,
}
