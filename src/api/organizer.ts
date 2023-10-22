import type { Organizer } from '../types'

import http, { withToken } from './http'

const PATH = '/admin/organizer/'

export async function getAdminOrganizers(refresh: boolean, token?: string, signal?: AbortSignal) {
  const qs = refresh ? '?refresh' : ''
  return http.get<Array<Organizer>>(PATH + qs, withToken({ signal }, token))
}

export async function putOrganizer(organizer: Organizer, token?: string, signal?: AbortSignal): Promise<Organizer> {
  return http.post<Organizer, Organizer>(PATH, organizer, withToken({ signal }, token))
}
