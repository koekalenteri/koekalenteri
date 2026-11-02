import type { InvitationAttachmentItem } from './lib/fileName'
import type { PublicDogEvent, Registration } from './types'
import { invitationAttachmentFileName } from './lib/fileName'

export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? 'http://127.0.0.1:8080'
export const WS_API_URL = process.env.REACT_APP_WS_API_URL ?? 'wss://127.0.0.1'

const ADMIN_ROOT = '/admin'
const ADMIN_EVENTS = `${ADMIN_ROOT}/event`

/** The query parameter that marks an entry from the admin side (`Path.registrationFromAdmin`). */
const FROM_PARAM = 'from'
const FROM_ADMIN = 'admin'

/** Whether a page was opened through `Path.registrationFromAdmin`, given the location's search. */
export const isFromAdmin = (search: string) => new URLSearchParams(search).get(FROM_PARAM) === FROM_ADMIN

/** A registrant's page (`/r/...`, `/p/...`) as the email links address it, relative to the site. */
const PARTICIPANT_PAGE = /^\/[pr]\//

/** A site-relative `href` marked as opened from the admin side, its path, query and fragment kept. */
const markFromAdmin = (href: string) => {
  const url = new URL(href, 'https://admin.invalid')
  url.searchParams.set(FROM_PARAM, FROM_ADMIN)
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * An email's HTML as the admin side previews it, with every link to a registrant's page marked as
 * opened from the admin side, so following one keeps the secretary's language (KOE-1512). The links
 * are marked in the rendered HTML rather than in the template data, because templates append to
 * them (`{{link}}/cancel`); the emails themselves are built without the mark. HTML without such a
 * link comes back as it was.
 */
export const markParticipantLinksFromAdmin = (html: string): string => {
  const page = new DOMParser().parseFromString(html, 'text/html')
  let marked = false
  for (const link of page.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href')
    if (href && PARTICIPANT_PAGE.test(href)) {
      link.setAttribute('href', markFromAdmin(href))
      marked = true
    }
  }
  return marked ? page.documentElement.outerHTML : html
}

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
    results: (id: string = ':id') => `${ADMIN_EVENTS}/results/${id}`,
    root: ADMIN_ROOT,
    startList: (id: string = ':id') => `${ADMIN_EVENTS}/startlist/${id}`,
    startListPreview: (id: string = ':id') => `${ADMIN_EVENTS}/startlist-preview/${id}`,
    startNumbers: (id: string = ':id') => `${ADMIN_EVENTS}/startnumbers/${id}`,
    stationResults: (id: string = ':id', stationId: string = ':stationId') =>
      `${ADMIN_EVENTS}/results/${id}/station/${stationId}`,
    stations: (id: string = ':id') => `${ADMIN_EVENTS}/stations/${id}`,
    stats: `${ADMIN_ROOT}/stats`,
    users: `${ADMIN_ROOT}/users`,
    viewEvent: (id: string = ':id') => `${ADMIN_EVENTS}/view/${id}`,
  },
  classStartNumbers: (eventId: string, eventClass: string, token: string) =>
    `/start-numbers/${eventId}/${encodeURIComponent(eventClass)}/access/${encodeURIComponent(token)}`,
  docs: '/docs',
  docsPage: (path: string = '*') => `/docs/${path}`,
  home: '/',
  invitation: (registration: ParticipantRegistration) => participantPath('r', registration, '/invitation'),
  invitationAttachment: (item: InvitationAttachmentItem) =>
    `${API_BASE_URL}/file/${item.invitationAttachment}/${invitationAttachmentFileName(item)}`,
  liveEntry: (eventId: string, stationId: string, token: string) =>
    `/live-entry/${eventId}/${stationId}/access/${encodeURIComponent(token)}`,
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
  /**
   * The registrant's page as the admin side links to it: marked, so opening it keeps the secretary's
   * language instead of switching to the registration's (KOE-1512).
   */
  registrationFromAdmin: (registration: ParticipantRegistration) => markFromAdmin(participantPath('r', registration)),
  registrationOk: (registration: ParticipantRegistration) => participantPath('r', registration, '/saved'),
  startList: (id: string = ':id') => `/startlist/${id}`,
  stats: '/stats',
  /** What changed in each release; `#<version>` opens at that release. */
  whatsNew: '/whats-new',
}
