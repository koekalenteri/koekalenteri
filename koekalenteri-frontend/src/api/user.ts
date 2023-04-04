import { User } from 'koekalenteri-shared/model'

import http, { withToken } from './http'

export async function getUser(token: string, signal?: AbortSignal) {
  return http.get<User>('/user', withToken({ signal }, token))
}

export async function getUsers(token: string, signal?: AbortSignal) {
  return http.get<User[]>('/admin/user', withToken({ signal }, token))
}
