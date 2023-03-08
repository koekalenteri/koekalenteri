import { Registration } from 'koekalenteri-shared/model'

import http, { withToken } from './http'

export async function getRegistrations(eventId: string, token?: string, signal?: AbortSignal): Promise<Registration[]> {
  return http.get<Registration[]>(`/admin/registration/${eventId}`, withToken({ signal }, token))
}

export async function getRegistration(
  eventId: string,
  id: string,
  token?: string,
  signal?: AbortSignal
): Promise<Registration | undefined> {
  return http.get<Registration>(`/registration/${eventId}/${id}`, withToken({ signal }, token))
}

export async function putRegistration(
  registration: Registration,
  token?: string,
  signal?: AbortSignal
): Promise<Registration> {
  return http.post<Registration, Registration>('/registration/', registration, withToken({ signal }, token))
}

export async function putRegistrationGroup(
  registration: Registration,
  token?: string,
  signal?: AbortSignal
): Promise<Registration> {
  const { eventId, id } = registration
  return http.post<Registration, Registration>(
    `/admin/registration/${eventId}/${id}`,
    registration,
    withToken({ signal }, token)
  )
}
