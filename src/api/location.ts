import type { Location } from '../types'
import http, { withToken } from './http'

const PATH = '/admin/location/'

export async function getLocations(token: string, signal?: AbortSignal): Promise<Location[]> {
  return http.get<Location[]>(PATH, withToken({ signal }, token))
}
