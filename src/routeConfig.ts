import type { ConfirmedEvent, PublicDogEvent, Registration, RegistrationClass } from './types'
import { formatDate } from './i18n/dates'

export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? 'http://127.0.0.1:8080'
export const WS_API_URL = process.env.REACT_APP_WS_API_URL ?? 'wss://127.0.0.1'

const ADMIN_ROOT = '/admin'
const ADMIN_EVENTS = `${ADMIN_ROOT}/event`

type RegistrationIds = Pick<Registration, 'eventId' | 'id'>
type InvitationAttachmentItem = Pick<ConfirmedEvent | Registration, 'eventType' | 'invitationAttachment'> & {
  class?: RegistrationClass | null
  dates?: Array<{ date: Date | string }>
  startDate?: Date | string
}

export const invitationAttachmentFileName = (item: InvitationAttachmentItem): string => {
  const date = item.dates?.[0]?.date ?? item.startDate
  const parts = ['koekutsu', formatDate(date ?? '', 'yyyyMMdd'), item.eventType, item.class].filter(Boolean)

  return `${parts.join('-')}.pdf`
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
    startListPreview: (id: string = ':id') => `${ADMIN_EVENTS}/startlist-preview/${id}`,
    users: `${ADMIN_ROOT}/users`,
    viewEvent: (id: string = ':id') => `${ADMIN_EVENTS}/view/${id}`,
  },
  home: '/',
  invitation: (registration: RegistrationIds) => `/r/${registration.eventId}/${registration.id}/invitation`,
  invitationAttachment: (item: InvitationAttachmentItem) =>
    `${API_BASE_URL}/file/${item.invitationAttachment}/${invitationAttachmentFileName(item)}`,
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
