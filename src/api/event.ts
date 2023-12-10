import type { DogEvent, PublicDogEvent } from '../types'

import { addDays, nextSaturday, startOfDay } from 'date-fns'

import http, { withToken } from './http'

const PATH = '/event/'
const ADMIN_PATH = '/admin/event/'

export async function getEvents(signal?: AbortSignal): Promise<PublicDogEvent[]> {
  return http.get<PublicDogEvent[]>(PATH, { signal })
}

export async function getAdminEvents(signal?: AbortSignal): Promise<DogEvent[]> {
  return http.get<DogEvent[]>(ADMIN_PATH, { signal })
}

export async function getEvent(id: string, signal?: AbortSignal): Promise<DogEvent> {
  return http.get<DogEvent>(`${PATH}${id}`, { signal })
}

export async function putEvent(event: Partial<DogEvent>, token?: string, signal?: AbortSignal): Promise<DogEvent> {
  return http.post<Partial<DogEvent>, DogEvent>(ADMIN_PATH, event, withToken({ signal }, token))
}

export async function putInvitationAttachment(
  eventId: string,
  file: File,
  token?: string,
  signal?: AbortSignal
): Promise<string> {
  const data = new FormData()
  data.append('file', file, file.name)

  return http.postRaw<FormData, string>(`/admin/file/invitation/${eventId}`, data, withToken({ signal }, token))
}

export async function copyEventWithRegistrations(eventId: string, token?: string, signal?: AbortSignal) {
  return http.post<{ id: string; startDate: Date }, DogEvent>(
    ADMIN_PATH + 'copy',
    { id: eventId, startDate: startOfDay(nextSaturday(addDays(Date.now(), 90))) },
    withToken({ signal }, token)
  )
}
