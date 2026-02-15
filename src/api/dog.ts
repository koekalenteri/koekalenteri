import type { Dog } from '../types'
import http from './http'

const PATH = '/dog/'

export async function getDog(regNo: string, refresh?: boolean, signal?: AbortSignal): Promise<Dog> {
  const encodedRegNo = regNo.replaceAll('/', '~')
  const qs = refresh ? '?refresh' : ''
  return http.get<Dog>(`${PATH}${encodedRegNo}${qs}`, { signal })
}
