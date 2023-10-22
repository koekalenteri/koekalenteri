import type { User, UserRole } from '../types'

import http, { withToken } from './http'

export async function getUser(token: string, signal?: AbortSignal) {
  return http.get<User>('/user', withToken({ signal }, token))
}

export async function getUsers(token: string, signal?: AbortSignal) {
  return http.get<User[]>('/admin/user', withToken({ signal }, token))
}

export async function putUser(user: User, token?: string, signal?: AbortSignal): Promise<User[]> {
  return http.post<User, User[]>('/admin/user', user, withToken({ signal }, token))
}

export async function putAdmin(
  item: { userId: string; admin: boolean },
  token: string | undefined,
  signal?: AbortSignal
): Promise<User> {
  return http.post<{ userId: string; admin: boolean }, User>('/admin/user/admin', item, withToken({ signal }, token))
}

export interface RoleItem {
  userId: string
  orgId: string
  role: UserRole | 'none'
}

export async function putRole(item: RoleItem, token: string | undefined, signal?: AbortSignal): Promise<User> {
  return http.post<RoleItem, User>('/admin/user/role', item, withToken({ signal }, token))
}
