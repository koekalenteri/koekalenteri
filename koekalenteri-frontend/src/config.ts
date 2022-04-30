export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8080';

export const ADMIN_ROOT = '/admin';

export const ADMIN_EVENTS = `${ADMIN_ROOT}/event`;
export const ADMIN_NEW_EVENT = `${ADMIN_EVENTS}/create`;
export const ADMIN_EDIT_EVENT = `${ADMIN_EVENTS}/edit`;
export const ADMIN_VIEW_EVENT = `${ADMIN_EVENTS}/view`;

export const ADMIN_JUDGES = `${ADMIN_ROOT}/judge`;
export const ADMIN_ORGS = `${ADMIN_ROOT}/organizations`;
export const ADMIN_OFFICIALS = `${ADMIN_ROOT}/officials`;
export const ADMIN_USERS = `${ADMIN_ROOT}/users`;
export const ADMIN_EVENT_TYPES = `${ADMIN_ROOT}/types`;

export const ADMIN_DEFAULT = ADMIN_EVENTS;
