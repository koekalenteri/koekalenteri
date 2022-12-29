export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8080'

const ADMIN_ROOT = '/admin'
const ADMIN_EVENTS = `${ADMIN_ROOT}/event`

export const Path = {
  home: '/',
  login: '/login',
  logout: '/logout',
  admin: {
    root: ADMIN_ROOT,
    index: `${ADMIN_ROOT}/event`,

    events: `${ADMIN_ROOT}/event`,
    newEvent: `${ADMIN_EVENTS}/create`,
    editEvent: `${ADMIN_EVENTS}/edit`,
    viewEvent: `${ADMIN_EVENTS}/view`,

    orgs: `${ADMIN_ROOT}/organizations`,
    users: `${ADMIN_ROOT}/users`,
    officials: `${ADMIN_ROOT}/officials`,
    judges: `${ADMIN_ROOT}/judge`,
    eventTypes: `${ADMIN_ROOT}/types`,
  },
}
