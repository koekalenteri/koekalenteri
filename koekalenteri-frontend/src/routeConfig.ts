import { Event, Registration } from 'koekalenteri-shared/model'

export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? 'http://127.0.0.1:8080'

const ADMIN_ROOT = '/admin'
const ADMIN_EVENTS = `${ADMIN_ROOT}/event`

export const Path = {
  home: '/',
  login: '/login',
  logout: '/logout',
  register: (event: Event, className?: string, classDate?: string) => {
    if (className) {
      return classDate
        ? `/event/${event.eventType}/${event.id}/${className}/${classDate}`
        : `/event/${event.eventType}/${event.id}/${className}`
    }
    return `/event/${event.eventType}/${event.id}`
  },
  registration: (registration: Registration) => `/r/${registration.eventId}/${registration.id}`,
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
