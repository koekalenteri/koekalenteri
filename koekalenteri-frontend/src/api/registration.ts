import { Registration } from 'koekalenteri-shared/model'

import http from './http'


export async function getRegistrations(eventId: string, signal?: AbortSignal): Promise<Registration[]> {
  return http.get<Registration[]>(`/admin/registration/${eventId}`, { signal })
}

export async function getRegistration(eventId: string, id: string, signal?: AbortSignal): Promise<Registration | undefined> {
  return http.get<Registration>(`/registration/${eventId}/${id}`, { signal })
}

export async function putRegistration(registration: Registration, signal?: AbortSignal): Promise<Registration> {
  return http.post<Registration, Registration>('/registration/', registration, { signal })
}

export async function putRegistrationGroup(registration: Registration, signal?: AbortSignal): Promise<Registration> {
  const { eventId, id } = registration
  return http.post<Registration, Registration>(`/admin/registration/${eventId}/${id}`, registration, { signal })
}
