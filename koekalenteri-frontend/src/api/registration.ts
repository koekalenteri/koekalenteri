import { Registration } from 'koekalenteri-shared/model'

import http from './http'


export async function getRegistrations(eventId: string, signal?: AbortSignal): Promise<Registration[]> {
  return http.get<Registration[]>(`/registration/${eventId}`, { signal })
}

export async function getRegistration(eventId: string, id: string, signal?: AbortSignal): Promise<Registration | undefined> {
  return http.get<Registration>(`/registration/${eventId}/${id}`, { signal })
}

export async function putRegistration(registration: Registration): Promise<Registration> {
  return http.post<Registration, Registration>('/registration/', registration)
}
