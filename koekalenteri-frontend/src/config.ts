export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8080';

export const ADMIN_ROOT = 'admin';
export const ADMIN_EVENTS = `/${ADMIN_ROOT}/events`;
export const ADMIN_JUDGES = `/${ADMIN_ROOT}/judges`;
export const ADMIN_ORGS = `/${ADMIN_ROOT}/organizations`;
export const ADMIN_USERS = `/${ADMIN_ROOT}/users`;
export const ADMIN_DEFAULT = ADMIN_EVENTS;
