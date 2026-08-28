import type { InvitationAttachmentItem } from './lib/fileName'
import type { PublicDogEvent, Registration } from './types'
import { invitationAttachmentFileName } from './lib/fileName'

export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? 'http://127.0.0.1:8080'
export const WS_API_URL = process.env.REACT_APP_WS_API_URL ?? 'wss://127.0.0.1'

const ADMIN_ROOT = '/admin'
const ADMIN_EVENTS = `${ADMIN_ROOT}/event`

type RegistrationIds = Pick<Registration, 'eventId' | 'id'>
type ParticipantRegistration = RegistrationIds & Pick<Registration, 'editToken'>

const participantPath = (prefix: 'p' | 'r', registration: ParticipantRegistration, suffix: string = '') => {
  const access = registration.editToken ? `/access/${encodeURIComponent(registration.editToken)}` : ''
  return `/${prefix}/${registration.eventId}/${registration.id}${access}${suffix}`
}
export const Path = {
  admin: {
    editEvent: (id: string = ':id') => `${ADMIN_EVENTS}/edit/${id}`,
    emailTemplates: `${ADMIN_ROOT}/templates`,
    eventBreakdown: `${ADMIN_ROOT}/event-breakdown`,

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
    stats: `${ADMIN_ROOT}/stats`,
    users: `${ADMIN_ROOT}/users`,
    viewEvent: (id: string = ':id') => `${ADMIN_EVENTS}/view/${id}`,
  },
  home: '/',
  invitation: (registration: ParticipantRegistration) => participantPath('r', registration, '/invitation'),
  invitationAttachment: (item: InvitationAttachmentItem) =>
    `${API_BASE_URL}/file/${item.invitationAttachment}/${invitationAttachmentFileName(item)}`,
  login: '/login',
  logout: '/logout',
  payment: (registration: ParticipantRegistration) => participantPath('p', registration),
  register: (event: PublicDogEvent, className?: string, classDate?: string) => {
    if (className) {
      return classDate
        ? `/event/${event.eventType}/${event.id}/${className}/${classDate}`
        : `/event/${event.eventType}/${event.id}/${className}`
    }
    return `/event/${event.eventType}/${event.id}`
  },
  registration: (registration: ParticipantRegistration) => participantPath('r', registration),
  registrationOk: (registration: ParticipantRegistration) => participantPath('r', registration, '/saved'),
  startList: (id: string = ':id') => `/startlist/${id}`,
  stats: '/tilastot',
}
