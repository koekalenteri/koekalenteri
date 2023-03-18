import { ConfirmedEvent, Registration, RegistrationGroupInfo } from 'koekalenteri-shared/model'

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

export async function putRegistrationGroups(
  eventId: string,
  groups: RegistrationGroupInfo[],
  token?: string,
  signal?: AbortSignal
): Promise<Pick<ConfirmedEvent, 'classes' | 'entries'> & { items: Registration[] }> {
  return http.post(`/admin/reg-groups/${eventId}`, groups, withToken({ signal }, token))
}
